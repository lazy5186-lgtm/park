const { spawn } = require('child_process');
const path = require('path');

let currentProcess = null;

function buildEnv(config) {
    return {
        ...process.env,
        GEMINI_API_KEY: config.geminiApiKey || '',
        IMAGE_MODEL: config.imageModel || 'gemini-3.1-flash-image-preview',
        TEXT_MODEL: config.textModel || 'gemini-2.5-pro',
        KAKAO_LINK: config.kakaoLink || '',
        USE_VIDEO: config.useVideo ? '1' : '0',
        RANDOM_TYPING: config.randomTyping ? '1' : '0',
        RANDOM_DELAY_MIN: String(config.postingInterval?.min ?? 3.5),
        RANDOM_DELAY_MAX: String(config.postingInterval?.max ?? 5),
        OVERLAY_KAKAO_ID: config.overlay?.kakaoId || 'loandr_',
        OVERLAY_PHONE: config.overlay?.phone || '010-8442-4224'
    };
}

function runScript(scriptName, config, sender) {
    if (currentProcess) {
        sender.send('script:log', { type: 'stderr', data: '이미 실행 중인 프로세스가 있습니다.\n' });
        return;
    }

    const scriptPath = path.join(__dirname, '..', scriptName);
    const env = buildEnv(config);

    sender.send('script:log', { type: 'info', data: `▶ ${scriptName} 실행 중...\n` });

    currentProcess = spawn('node', [scriptPath], {
        cwd: path.join(__dirname, '..'),
        env,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    currentProcess.stdout.on('data', (data) => {
        sender.send('script:log', { type: 'stdout', data: data.toString() });
    });

    currentProcess.stderr.on('data', (data) => {
        sender.send('script:log', { type: 'stderr', data: data.toString() });
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
        currentProcess.kill('SIGTERM');
        currentProcess = null;
        return true;
    }
    return false;
}

function isRunning() {
    return currentProcess !== null;
}

module.exports = { runScript, stopProcess, isRunning };
