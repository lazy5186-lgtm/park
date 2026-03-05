const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { loadConfig, saveConfig, loadKeywords, resetKeywords, loadHistory } = require('./config-manager');
const { runScript, stopProcess, isRunning } = require('./process-runner');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 900,
        minHeight: 600,
        title: 'PARK SAMPLE - 블로그 자동화',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    stopProcess();
    app.quit();
});

// ---- IPC Handlers ----

ipcMain.handle('config:load', () => {
    return loadConfig();
});

ipcMain.handle('config:save', (_event, config) => {
    saveConfig(config);
    return { success: true };
});

ipcMain.handle('script:generate', (event) => {
    const config = loadConfig();
    runScript('generate_article.js', config, event.sender);
    return { started: true };
});

ipcMain.handle('script:post', (event) => {
    const config = loadConfig();
    runScript('3.post.js', config, event.sender);
    return { started: true };
});

ipcMain.handle('script:auto', (event) => {
    const config = loadConfig();
    // 자동 모드: generate → 완료 후 post
    const sender = event.sender;

    sender.send('script:log', { type: 'info', data: '🔄 자동 모드: 글 생성 시작...\n' });
    runScript('generate_article.js', config, {
        send: (channel, data) => {
            sender.send(channel, data);
            if (channel === 'script:done' && data.code === 0) {
                setTimeout(() => {
                    sender.send('script:log', { type: 'info', data: '\n🔄 자동 모드: 포스팅 시작...\n' });
                    runScript('3.post.js', config, sender);
                }, 1000);
            }
        }
    });
    return { started: true };
});

ipcMain.handle('script:stop', () => {
    const stopped = stopProcess();
    return { stopped };
});

ipcMain.handle('keywords:load', () => {
    return loadKeywords();
});

ipcMain.handle('keywords:reset', () => {
    resetKeywords();
    return { success: true };
});

ipcMain.handle('history:load', () => {
    return loadHistory();
});

ipcMain.handle('result:load', () => {
    const resultPath = path.join(__dirname, '..', 'result.json');
    try {
        if (fs.existsSync(resultPath)) {
            const raw = fs.readFileSync(resultPath, 'utf-8');
            const result = JSON.parse(raw);

            // 이미지 파일 목록 로드
            const imgsDir = path.join(__dirname, '..', 'imgs');
            let images = [];
            if (fs.existsSync(imgsDir)) {
                images = fs.readdirSync(imgsDir)
                    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
                    .sort()
                    .map(f => {
                        const fullPath = path.join(imgsDir, f);
                        const base64 = fs.readFileSync(fullPath).toString('base64');
                        const ext = path.extname(f).slice(1).toLowerCase();
                        const mime = ext === 'jpg' ? 'jpeg' : ext;
                        return { name: f, dataUrl: `data:image/${mime};base64,${base64}` };
                    });
            }

            return { exists: true, data: result, images };
        }
    } catch (e) {
        console.error('result.json 로드 오류:', e.message);
    }
    return { exists: false };
});
