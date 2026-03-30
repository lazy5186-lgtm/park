const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ADB_DIR = path.join(__dirname, '..', 'lib');
const ADB_EXE = path.join(ADB_DIR, 'adb.exe');
const ADB_DLL1 = path.join(ADB_DIR, 'AdbWinApi.dll');
const ADB_DLL2 = path.join(ADB_DIR, 'AdbWinUsbApi.dll');
const DOWNLOAD_URL = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';

/**
 * ADB가 설치되어 있는지 확인
 */
function isAdbInstalled() {
    return fs.existsSync(ADB_EXE) && fs.existsSync(ADB_DLL1) && fs.existsSync(ADB_DLL2);
}

/**
 * HTTPS 리다이렉트를 따라가며 파일 다운로드
 */
function downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        function doRequest(reqUrl) {
            https.get(reqUrl, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    doRequest(res.headers.location);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`다운로드 실패 (HTTP ${res.statusCode})`));
                    return;
                }

                const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
                let downloadedBytes = 0;
                const file = fs.createWriteStream(destPath);

                res.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (totalBytes > 0 && onProgress) {
                        onProgress(Math.round((downloadedBytes / totalBytes) * 100));
                    }
                });

                res.pipe(file);
                file.on('finish', () => file.close(() => resolve()));
                file.on('error', (err) => {
                    fs.unlink(destPath, () => {});
                    reject(err);
                });
            }).on('error', reject);
        }
        doRequest(url);
    });
}

/**
 * PowerShell로 ZIP 압축 해제
 */
function extractZip(zipPath, extractTo) {
    return new Promise((resolve, reject) => {
        const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractTo}' -Force"`;
        exec(cmd, { timeout: 60000 }, (error) => {
            if (error) reject(new Error(`압축 해제 실패: ${error.message}`));
            else resolve();
        });
    });
}

/**
 * ADB 자동 설치 (다운로드 → 압축 해제 → 필요 파일만 lib에 복사)
 */
async function installAdb(logFn) {
    const log = logFn || console.log;

    if (isAdbInstalled()) {
        log('ADB가 이미 설치되어 있습니다.');
        return { success: true, alreadyInstalled: true };
    }

    const tempDir = path.join(ADB_DIR, '_adb_temp');
    const zipPath = path.join(tempDir, 'platform-tools.zip');

    try {
        // 임시 폴더 생성
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // 다운로드
        log('ADB 다운로드 중...');
        await downloadFile(DOWNLOAD_URL, zipPath, (percent) => {
            log(`다운로드 진행: ${percent}%`);
        });
        log('다운로드 완료.');

        // 압축 해제
        log('압축 해제 중...');
        await extractZip(zipPath, tempDir);
        log('압축 해제 완료.');

        // platform-tools 폴더에서 필요한 파일만 lib로 복사
        const ptDir = path.join(tempDir, 'platform-tools');
        const filesToCopy = [
            { src: 'adb.exe', dest: 'adb.exe' },
            { src: 'AdbWinApi.dll', dest: 'AdbWinApi.dll' },
            { src: 'AdbWinUsbApi.dll', dest: 'AdbWinUsbApi.dll' },
        ];

        for (const f of filesToCopy) {
            const srcPath = path.join(ptDir, f.src);
            const destPath = path.join(ADB_DIR, f.dest);
            if (fs.existsSync(srcPath)) {
                fs.copyFileSync(srcPath, destPath);
                log(`${f.dest} 설치 완료.`);
            } else {
                log(`경고: ${f.src}를 찾을 수 없습니다.`);
            }
        }

        // 임시 폴더 정리
        fs.rmSync(tempDir, { recursive: true, force: true });

        if (isAdbInstalled()) {
            log('ADB 설치가 완료되었습니다.');
            return { success: true, alreadyInstalled: false };
        } else {
            throw new Error('ADB 파일 복사 후 검증 실패');
        }
    } catch (error) {
        // 임시 폴더 정리
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
        log(`ADB 설치 실패: ${error.message}`);
        return { success: false, error: error.message };
    }
}

module.exports = { isAdbInstalled, installAdb };
