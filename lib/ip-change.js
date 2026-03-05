const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * 여러 서비스에서 IP 주소를 확인하는 함수
 */
function checkIP() {
    return new Promise((resolve, reject) => {
        console.log('🔍 IP 주소 확인 중...');
        
        // 확인할 서비스 목록
        const ipServices = [
            { name: 'icanhazip', url: 'https://icanhazip.com' },
            { name: 'ipify', url: 'https://api.ipify.org' },
            { name: 'ifconfig.me', url: 'https://ifconfig.me' }
        ];
        
        let results = {
            ipv4: {},
            ipv6: {}
        };
        let completed = 0;
        const totalChecks = ipServices.length * 2; // IPv4와 IPv6 각각 확인
        
        // IPv4 확인
        ipServices.forEach(service => {
            exec(`curl -4 -s ${service.url}`, (error, stdout, stderr) => {
                if (!error && stdout.trim()) {
                    results.ipv4[service.name] = stdout.trim();
                }
                
                completed++;
                if (completed === totalChecks) resolve(results);
            });
        });
        
        // IPv6 확인
        ipServices.forEach(service => {
            exec(`curl -6 -s ${service.url}`, (error, stdout, stderr) => {
                if (!error && stdout.trim()) {
                    results.ipv6[service.name] = stdout.trim();
                }
                
                completed++;
                if (completed === totalChecks) resolve(results);
            });
        });
    });
}

/**
 * OS별 ADB 경로를 찾는 함수
 */
function getAdbCommand() {
    const platform = os.platform();
    
    if (platform === 'darwin') {
        // macOS
        return new Promise((resolve) => {
            // 1. 시스템 PATH에서 adb 찾기
            exec('which adb', (error, stdout) => {
                if (!error && stdout.trim()) {
                    resolve(stdout.trim());
                    return;
                }
                
                // 2. Android Studio 기본 경로들 확인
                const possiblePaths = [
                    `${os.homedir()}/Library/Android/sdk/platform-tools/adb`,
                    '/Applications/Android Studio.app/Contents/platform-tools/adb',
                    '/usr/local/bin/adb',
                    '/opt/homebrew/bin/adb'
                ];
                
                for (const adbPath of possiblePaths) {
                    if (fs.existsSync(adbPath)) {
                        resolve(adbPath);
                        return;
                    }
                }
                
                resolve('adb'); // 기본값
            });
        });
        
    } else if (platform === 'win32') {
        // Windows
        return new Promise((resolve) => {
            // 1. lib 폴더의 adb.exe 확인 (우선순위)
            const libAdb = path.join(__dirname, 'adb.exe');
            if (fs.existsSync(libAdb)) {
                resolve(`"${libAdb}"`);
                return;
            }
            
            // 2. 현재 디렉토리의 adb.exe 확인
            const localAdb = path.join(process.cwd(), 'adb.exe');
            if (fs.existsSync(localAdb)) {
                resolve('.\\adb.exe');
                return;
            }
            
            // 3. 시스템 PATH에서 찾기
            exec('where adb', (error, stdout) => {
                if (!error && stdout.trim()) {
                    resolve('adb');
                    return;
                }
                
                // 4. Android Studio 기본 경로들 확인
                const possiblePaths = [
                    `${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe`,
                    `${process.env.PROGRAMFILES}\\Android\\android-sdk\\platform-tools\\adb.exe`,
                    `${process.env['PROGRAMFILES(X86)']}\\Android\\android-sdk\\platform-tools\\adb.exe`,
                    'C:\\Android\\sdk\\platform-tools\\adb.exe'
                ];
                
                for (const adbPath of possiblePaths) {
                    if (fs.existsSync(adbPath)) {
                        resolve(`"${adbPath}"`); // 공백 포함 경로 처리
                        return;
                    }
                }
                
                resolve('adb'); // 기본값
            });
        });
        
    } else {
        // Linux 등 기타 OS
        return Promise.resolve('adb');
    }
}

/**
 * 비행기 모드를 켜고 끄는 함수
 */
async function toggleAirplaneMode(adbPath, enable) {
    return new Promise((resolve, reject) => {
        const value = enable ? 'enable' : 'disable';
        const command = `${adbPath} shell cmd connectivity airplane-mode ${value}`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                // Windows에서 권한 문제가 있을 수 있으므로 대체 명령 시도
                const altCommand = `${adbPath} shell settings put global airplane_mode_on ${enable ? 1 : 0}`;
                exec(altCommand, (altError) => {
                    if (altError) {
                        reject(error);
                    } else {
                        // 브로드캐스트 전송
                        const broadcastCmd = `${adbPath} shell am broadcast -a android.intent.action.AIRPLANE_MODE`;
                        exec(broadcastCmd, () => resolve());
                    }
                });
            } else {
                resolve();
            }
        });
    });
}

/**
 * OS 정보 출력
 */
function printSystemInfo() {
    const platform = os.platform();
    const osName = {
        'darwin': 'macOS',
        'win32': 'Windows',
        'linux': 'Linux'
    }[platform] || platform;
    
    console.log('═══════════════════════════════════════');
    console.log('🚀 TTJ 코딩 클래스 - IP 체인저 🚀');
    console.log('═══════════════════════════════════════');
    console.log(`💻 운영체제: ${osName}`);
    console.log(`🖥️  버전: ${os.release()}`);
    console.log(`🏗️  아키텍처: ${os.arch()}`);
    console.log('───────────────────────────────────────');
}

/**
 * 메인 함수: 비행기 모드로 IP 변경
 */
async function changeIPUniversal() {
    try {
        printSystemInfo();
        console.log('✈️  비행기 모드를 사용한 IP 변경 시작...\n');
        
        // ADB 경로 확인
        console.log('🔧 ADB 설정 확인 중...');
        const adbPath = await getAdbCommand();
        console.log(`📍 ADB 경로: ${adbPath}`);
        
        // ADB 연결 확인
        await new Promise((resolve, reject) => {
            exec(`${adbPath} devices`, (error, stdout) => {
                if (error) {
                    reject(new Error('ADB를 찾을 수 없습니다. Android SDK/Platform-tools가 설치되어 있는지 확인하세요.'));
                } else {
                    // device 목록 파싱
                    const lines = stdout.trim().split('\n');
                    const devices = lines.slice(1).filter(line => line.includes('device'));
                    
                    if (devices.length === 0) {
                        reject(new Error('연결된 Android 기기가 없습니다.'));
                    } else {
                        const deviceId = devices[0].split('\t')[0];
                        console.log(`✔️  Android 기기 연결됨: ${deviceId}\n`);
                        resolve();
                    }
                }
            });
        });
        
        // 변경 전 IP 확인
        console.log('📡 현재 네트워크 상태 확인...');
        const oldIP = await checkIP();
        
        // 가장 신뢰할 수 있는 IP 선택
        const oldIPv4 = oldIP.ipv4?.ipify || oldIP.ipv4?.icanhazip || oldIP.ipv4?.['ifconfig.me'] || 'IP 확인 불가';
        const oldIPv6 = oldIP.ipv6?.ipify || oldIP.ipv6?.icanhazip || oldIP.ipv6?.['ifconfig.me'] || 'IPv6 없음';
        
        console.log('───────────────────────────────────────');
        console.log('📍 현재 IP 주소:');
        console.log(`   IPv4: ${oldIPv4}`);
        if (oldIPv6 !== 'IPv6 없음') {
            console.log(`   IPv6: ${oldIPv6}`);
        }
        console.log('───────────────────────────────────────\n');
        
        // 비행기 모드 켜기
        console.log('🛫 비행기 모드 활성화 중...');
        await toggleAirplaneMode(adbPath, true);
        console.log('✔️  비행기 모드 활성화 완료');
        
        // 네트워크 완전 해제 대기
        console.log('⏳ 네트워크 완전 해제 대기 (5초)...');
        for (let i = 5; i > 0; i--) {
            process.stdout.write(`   ${i}초... `);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('\n');
        
        // 비행기 모드 끄기
        console.log('🛬 비행기 모드 비활성화 중...');
        await toggleAirplaneMode(adbPath, false);
        console.log('✔️  비행기 모드 비활성화 완료');
        
        // 네트워크 재연결 대기
        console.log('⏳ 네트워크 재연결 대기 중 (5초)...');
        for (let i = 5; i > 0; i--) {
            process.stdout.write(`   ${i}초... `);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('\n');
        
        // 추가 안정화
        console.log('⏳ 네트워크 안정화 대기 (5초)...');
        for (let i = 5; i > 0; i--) {
            process.stdout.write(`   ${i}초... `);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('\n');
        
        // 변경 후 IP 확인
        console.log('📡 새로운 네트워크 상태 확인...');
        const newIP = await checkIP();
        
        // 가장 신뢰할 수 있는 IP 선택
        const newIPv4 = newIP.ipv4?.ipify || newIP.ipv4?.icanhazip || newIP.ipv4?.['ifconfig.me'] || 'IP 확인 불가';
        const newIPv6 = newIP.ipv6?.ipify || newIP.ipv6?.icanhazip || newIP.ipv6?.['ifconfig.me'] || 'IPv6 없음';
        
        console.log('───────────────────────────────────────');
        console.log('📍 변경된 IP 주소:');
        console.log(`   IPv4: ${newIPv4}`);
        if (newIPv6 !== 'IPv6 없음') {
            console.log(`   IPv6: ${newIPv6}`);
        }
        console.log('───────────────────────────────────────\n');
        
        // IP 변경 여부 확인
        const ipv4Changed = oldIPv4 !== newIPv4 && oldIPv4 !== 'IP 확인 불가' && newIPv4 !== 'IP 확인 불가';
        const ipv6Changed = oldIPv6 !== newIPv6 && oldIPv6 !== 'IPv6 없음' && newIPv6 !== 'IPv6 없음';
        
        console.log('═══════════════════════════════════════');
        if (ipv4Changed || ipv6Changed) {
            console.log('✅ IP가 성공적으로 변경되었습니다! 🎉');
            if (ipv4Changed) {
                console.log(`   IPv4: ${oldIPv4} → ${newIPv4}`);
            }
            if (ipv6Changed) {
                console.log(`   IPv6: ${oldIPv6} → ${newIPv6}`);
            }
        } else {
            console.log('⚠️  IP가 변경되지 않았습니다.');
            console.log('\n💡 가능한 원인:');
            console.log('   • 유선 LAN 연결 (WiFi/모바일 데이터만 변경됨)');
            console.log('   • 통신사 정책 (같은 IP 재할당)');
            console.log('   • 대기 시간 부족');
        }
        console.log('═══════════════════════════════════════');
        console.log('🚀 https://ttj.kr 🚀');
        
    } catch (error) {
        console.log('═══════════════════════════════════════');
        console.log('❌ 오류 발생:', error.message || error);
        console.log('═══════════════════════════════════════');
        
        console.log('\n💡 해결 방법:\n');
        
        if (error.message?.includes('ADB를 찾을 수 없습니다')) {
            const platform = os.platform();
            if (platform === 'darwin') {
                console.log('【 macOS 】');
                console.log('1. Homebrew로 설치:');
                console.log('   brew install --cask android-platform-tools\n');
                console.log('2. 또는 Android Studio 설치:');
                console.log('   https://developer.android.com/studio');
            } else if (platform === 'win32') {
                console.log('【 Windows 】');
                console.log('1. Platform Tools 다운로드:');
                console.log('   https://developer.android.com/studio/releases/platform-tools');
                console.log('2. 압축 해제 후 adb.exe를 현재 폴더에 복사');
                console.log('3. 또는 시스템 PATH에 추가');
            }
        } else if (error.message?.includes('연결된 Android 기기가 없습니다')) {
            console.log('【 Android 기기 연결 】');
            console.log('1. USB 케이블로 Android 기기 연결');
            console.log('2. 개발자 옵션 활성화:');
            console.log('   설정 → 휴대전화 정보 → 빌드번호 7번 탭');
            console.log('3. USB 디버깅 활성화:');
            console.log('   설정 → 개발자 옵션 → USB 디버깅 ON');
            console.log('4. 연결 시 "이 컴퓨터를 항상 허용" 체크');
        }
        
        console.log('\n🚀 https://ttj.kr 🚀');
        
        // 오류를 다시 throw하여 호출하는 곳에서 catch할 수 있도록 함
        throw error;
    }
}

// 실행
if (require.main === module) {
    changeIPUniversal();
}

// 모듈로 export (다른 파일에서 사용 가능)
module.exports = { changeIPUniversal, checkIP, toggleAirplaneMode };