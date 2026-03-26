const { exec } = require('child_process');
const https = require('https');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Node.js 네이티브 HTTP로 공인 IP 확인 (curl 프로세스 생성 없이)
 */
function getPublicIP() {
    return new Promise((resolve) => {
        const services = [
            { url: 'https://api.ipify.org?format=json', parse: (data) => JSON.parse(data).ip },
            { url: 'https://httpbin.org/ip', parse: (data) => JSON.parse(data).origin },
            { url: 'http://ip-api.com/json', parse: (data) => JSON.parse(data).query, useHttp: true },
        ];

        let resolved = false;

        function tryService(index) {
            if (index >= services.length || resolved) {
                if (!resolved) resolve(null);
                return;
            }

            const service = services[index];
            const client = service.useHttp ? http : https;

            const req = client.get(service.url, { timeout: 5000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (resolved) return;
                    try {
                        const ip = service.parse(data);
                        if (ip) {
                            resolved = true;
                            resolve(ip.trim());
                        } else {
                            tryService(index + 1);
                        }
                    } catch (e) {
                        tryService(index + 1);
                    }
                });
            });

            req.on('error', () => {
                if (!resolved) tryService(index + 1);
            });

            req.on('timeout', () => {
                req.destroy();
                if (!resolved) tryService(index + 1);
            });
        }

        tryService(0);
    });
}

/**
 * OS별 ADB 경로를 찾는 함수
 */
function getAdbPath() {
    const platform = os.platform();

    // 1. lib 폴더의 adb.exe (Windows)
    if (platform === 'win32') {
        const libAdb = path.join(__dirname, 'adb.exe');
        if (fs.existsSync(libAdb)) return libAdb;

        const cwdAdb = path.join(process.cwd(), 'adb.exe');
        if (fs.existsSync(cwdAdb)) return cwdAdb;
    }

    // 2. macOS 기본 경로
    if (platform === 'darwin') {
        const possiblePaths = [
            `${os.homedir()}/Library/Android/sdk/platform-tools/adb`,
            '/usr/local/bin/adb',
            '/opt/homebrew/bin/adb'
        ];
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) return p;
        }
    }

    return 'adb';
}

function execAdb(args, timeout) {
    timeout = timeout || 15000;
    const adbPath = getAdbPath();
    const cmd = `"${adbPath}" ${args}`;
    return new Promise((resolve, reject) => {
        exec(cmd, { encoding: 'utf8', timeout }, (error, stdout, stderr) => {
            if (error) reject(new Error(stderr || error.message));
            else resolve(stdout.trim());
        });
    });
}

/**
 * 모바일 데이터 OFF → 0.5초 → ON (비행기 모드보다 훨씬 빠름)
 */
async function toggleMobileData(logFn) {
    const log = logFn || console.log;

    log('모바일 데이터 OFF...');
    await execAdb('shell svc data disable');

    await delay(500);

    log('모바일 데이터 ON...');
    await execAdb('shell svc data enable');
}

/**
 * ADB 기기 연결 확인
 */
async function checkDevice() {
    const output = await execAdb('devices');
    const lines = output.split('\n').slice(1);
    for (const line of lines) {
        const parts = line.trim().split('\t');
        if (parts.length === 2 && parts[1] === 'device') {
            return parts[0];
        }
    }
    return null;
}

/**
 * 메인 함수: 모바일 데이터 토글로 IP 변경
 */
async function changeIPUniversal() {
    try {
        console.log('═══════════════════════════════════════');
        console.log('🚀 IP 체인저 (ADB 모바일 데이터 방식) 🚀');
        console.log('═══════════════════════════════════════');

        // ADB 기기 확인
        console.log('🔧 ADB 기기 확인 중...');
        const deviceId = await checkDevice();
        if (!deviceId) {
            throw new Error('연결된 Android 기기가 없습니다. USB 디버깅을 활성화하세요.');
        }
        console.log(`✔️  Android 기기 연결됨: ${deviceId}\n`);

        // 변경 전 IP
        console.log('📡 현재 IP 확인...');
        const oldIp = await getPublicIP();
        console.log(`📍 현재 IP: ${oldIp || '확인 불가'}\n`);

        // 모바일 데이터 토글 (0.5초)
        await toggleMobileData();
        console.log('');

        // 폴링: IP를 받아올 때까지 1초 간격 (최대 15초)
        console.log('⏳ IP 할당 대기 (폴링)...');
        let newIp = null;
        for (let i = 0; i < 15; i++) {
            await delay(1000);
            try {
                newIp = await getPublicIP();
                if (newIp) {
                    console.log(`   ${i + 1}초 만에 IP 확인됨`);
                    break;
                }
            } catch (e) {
                // 네트워크 아직 복구 안됨
            }
        }

        console.log('');
        console.log('═══════════════════════════════════════');
        if (newIp && oldIp !== newIp) {
            console.log(`✅ IP 변경 성공! ${oldIp} → ${newIp}`);
        } else if (newIp && oldIp === newIp) {
            console.log('⚠️  IP가 변경되지 않았습니다.');
            console.log('   • 통신사 정책으로 같은 IP가 재할당되었을 수 있습니다.');
        } else {
            console.log('❌ IP 확인 실패');
        }
        console.log('═══════════════════════════════════════');

    } catch (error) {
        console.log('═══════════════════════════════════════');
        console.log('❌ 오류:', error.message || error);
        console.log('═══════════════════════════════════════');

        if (error.message?.includes('ADB') || error.message?.includes('Android')) {
            console.log('\n💡 해결 방법:');
            console.log('1. USB 케이블로 Android 기기 연결');
            console.log('2. 개발자 옵션 → USB 디버깅 ON');
            console.log('3. adb.exe를 lib 폴더에 배치');
        }

        throw error;
    }
}

// 실행
if (require.main === module) {
    changeIPUniversal();
}

module.exports = { changeIPUniversal, getPublicIP, toggleMobileData };
