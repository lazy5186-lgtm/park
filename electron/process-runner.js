const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getUserDataDir, getActiveProfileDir } = require('./config-manager');

let currentProcess = null;

// Windows에서 cp949 → UTF-8 디코딩
let iconv = null;
try { iconv = require('iconv-lite'); } catch (e) { /* optional */ }

function decodeOutput(buf) {
    // cp949 깨짐 감지: 0x80 이상 바이트가 있고 UTF-8로 디코딩 시 replacement char 있으면 cp949
    const utf8 = buf.toString('utf-8');
    if (process.platform === 'win32' && iconv && utf8.includes('\ufffd')) {
        return iconv.decode(buf, 'cp949');
    }
    return utf8;
}

function getSelectedAccount() {
    try {
        const accountsPath = path.join(getUserDataDir(), 'naver_accounts.json');
        if (fs.existsSync(accountsPath)) {
            const data = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
            if (data.selectedId) {
                const account = data.accounts.find(a => a.id === data.selectedId);
                if (account) return { id: account.id, pw: account.pw };
            }
        }
    } catch (e) { /* ignore */ }
    return { id: '', pw: '' };
}

function buildEnv(config, accountOverride) {
    const account = accountOverride || getSelectedAccount();
    return {
        ...process.env,
        GEMINI_API_KEY: config.geminiApiKey || '',
        IMAGE_MODEL: config.imageModel || 'gemini-2.5-flash-image',
        TEXT_MODEL: config.textModel || 'gemini-3-flash-preview',
        KAKAO_LINK: config.kakaoLink || '',
        POST_ID: account.id,
        POST_PASSWORD: account.pw,
        SCHEDULE_MODE: config.scheduleMode || 'instant',
        SCHEDULE_DATE: config.scheduleDate || '',
        SCHEDULE_HOUR: config.scheduleHour || '',
        SCHEDULE_MINUTE: config.scheduleMinute || '',
        RANDOM_DELAY_MIN: '3.5',
        RANDOM_DELAY_MAX: '5',
        OVERLAY_KAKAO_ID: config.overlay?.kakaoId || 'loandr_',
        OVERLAY_PHONE: config.overlay?.phone || '010-8442-4224',
        IMAGE_COUNT: String(config.imageCount || 0),
        USER_DATA_DIR: getUserDataDir(),
        ACTIVE_PROFILE_DIR: getActiveProfileDir() || '',
        OVERRIDE_KEYWORD: config.overrideKeyword || ''
    };
}

function runScript(scriptName, config, sender, accountOverride) {
    if (currentProcess) {
        sender.send('script:log', { type: 'stderr', data: '이미 실행 중인 프로세스가 있습니다.\n' });
        return;
    }

    const env = buildEnv(config, accountOverride || null);
    const cwd = path.join(__dirname, '..');

    sender.send('script:log', { type: 'info', data: `▶ ${scriptName} 실행 중...\n` });

    // Electron 내장 Node.js 사용 (ELECTRON_RUN_AS_NODE=1로 순수 Node 모드)
    currentProcess = spawn(process.execPath, [scriptName], {
        cwd,
        env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['pipe', 'pipe', 'pipe']
    });

    currentProcess.stdout.on('data', (buf) => {
        sender.send('script:log', { type: 'stdout', data: decodeOutput(buf) });
    });

    currentProcess.stderr.on('data', (buf) => {
        const text = decodeOutput(buf);
        // Windows 프로세스 종료 시 OS가 출력하는 메시지 필터링
        if (text.includes('프로세스를 종료할 수 없습니다') || text.includes('실행 중인 작업 인스턴스가 없습니다')) return;
        sender.send('script:log', { type: 'stderr', data: text });
    });

    currentProcess.on('close', (code) => {
        sender.send('script:log', {
            type: 'info',
            data: `\n■ ${scriptName} 종료 (코드: ${code})\n`
        });
        sender.send('script:done', { code, script: scriptName });
        currentProcess = null;
    });

    currentProcess.on('error', (err) => {
        sender.send('script:log', {
            type: 'stderr',
            data: `프로세스 오류: ${err.message}\n`
        });
        currentProcess = null;
    });
}

function stopProcess() {
    if (currentProcess) {
        try {
            currentProcess.kill('SIGTERM');
        } catch (e) {
            // 이미 종료된 프로세스 — 무시
        }
        currentProcess = null;
        return true;
    }
    return false;
}

function isRunning() {
    return currentProcess !== null;
}

module.exports = { runScript, stopProcess, isRunning };
