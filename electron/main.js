const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { loadConfig, saveConfig, loadKeywords, resetKeywords, removeKeyword, saveCustomKeywords, loadHistory,
    loadNaverAccounts, addNaverAccount, removeNaverAccount, selectNaverAccount,
    getNaverAccountCookieStatus, saveNaverCookies, loadNaverCookies } = require('./config-manager');
const { runScript, stopProcess, isRunning } = require('./process-runner');
const { getPublicIP } = require('./ip-checker');
const ipChanger = require('./ip-changer');

const os = require('os');

function findChromePath() {
    const platform = os.platform();
    let chromePaths = [];
    if (platform === 'win32') {
        chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
        ];
    } else if (platform === 'darwin') {
        chromePaths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            path.join(os.homedir(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
        ];
    } else {
        chromePaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser'
        ];
    }
    for (const p of chromePaths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 900,
        minHeight: 600,
        title: 'N_blog_auto',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
    createWindow();

    // 자동 업데이트 체크
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
        console.log('업데이트 발견:', info.version);
        mainWindow?.webContents.send('update:available', { version: info.version });
    });

    autoUpdater.on('download-progress', (progress) => {
        mainWindow?.webContents.send('update:progress', { percent: Math.round(progress.percent) });
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('업데이트 다운로드 완료:', info.version);
        mainWindow?.webContents.send('update:downloaded', { version: info.version });
    });

    autoUpdater.on('update-not-available', () => {
        mainWindow?.webContents.send('update:notAvailable');
    });

    autoUpdater.on('error', (err) => {
        console.log('업데이트 체크 오류:', err.message);
        mainWindow?.webContents.send('update:error', { message: err.message });
    });

    autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
    stopProcess();
    app.quit();
});

// ---- IPC Handlers ----

ipcMain.handle('app:version', () => {
    return app.getVersion();
});

ipcMain.handle('update:check', async () => {
    try {
        const result = await autoUpdater.checkForUpdates();
        return { checking: true };
    } catch (e) {
        return { error: e.message };
    }
});

ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall();
});

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

function isResultValid() {
    const resultPath = path.join(__dirname, '..', 'result.json');
    console.log('[DEBUG] result.json 경로:', resultPath);
    console.log('[DEBUG] 파일 존재:', fs.existsSync(resultPath));
    try {
        const raw = fs.readFileSync(resultPath, 'utf-8');
        const data = JSON.parse(raw);
        // gemini 객체와 h1(제목)이 있으면 유효한 것으로 판단
        const valid = !!(data.gemini && (data.gemini.h1 || (data.gemini.sections && data.gemini.sections.length > 0)));
        console.log('[DEBUG] result.json 유효:', valid, '| h1:', data.gemini?.h1 || 'none', '| sections:', data.gemini?.sections?.length || 0);
        return valid;
    } catch (e) {
        console.log('[DEBUG] result.json 읽기 실패:', e.message);
        return false;
    }
}

// 글 생성 후 포스팅으로 이어지는 공통 로직
function generateThenPost(config, sender, label = '') {
    const prefix = label ? `${label}: ` : '';
    runScript('generate_article.js', config, {
        send: (channel, data) => {
            if (channel === 'script:done') {
                if (isResultValid()) {
                    sender.send('script:log', { type: 'info', data: `\n${prefix}글 생성 완료! 5초 후 포스팅 시작...\n` });
                    setTimeout(() => {
                        runScript('3.post.js', config, sender);
                    }, 5000);
                } else {
                    sender.send('script:log', { type: 'stderr', data: '\n글 생성에 실패했습니다. 포스팅을 중단합니다.\n' });
                    sender.send('script:done', { code: 1, script: '3.post.js' });
                }
            } else {
                sender.send(channel, data);
            }
        }
    });
}

ipcMain.handle('script:post', (event) => {
    const config = loadConfig();
    const sender = event.sender;

    if (!isResultValid()) {
        sender.send('script:log', { type: 'info', data: 'result.json이 없거나 글 데이터가 없습니다. 글 생성을 먼저 실행합니다...\n' });
        generateThenPost(config, sender);
    } else {
        sender.send('script:log', { type: 'info', data: '임시 저장된 글이 있습니다. 바로 포스팅을 시작합니다...\n' });
        runScript('3.post.js', config, sender);
    }
    return { started: true };
});

ipcMain.handle('script:postDraft', (event) => {
    const config = loadConfig();
    const sender = event.sender;

    if (!isResultValid()) {
        sender.send('script:log', { type: 'stderr', data: '임시 저장된 글이 없습니다. 글 생성을 먼저 실행해주세요.\n' });
        sender.send('script:done', { code: 1, script: '3.post.js' });
        return { started: false };
    }

    sender.send('script:log', { type: 'info', data: '임시 저장된 글을 포스팅합니다...\n' });
    runScript('3.post.js', config, sender);
    return { started: true };
});

ipcMain.handle('script:auto', (event) => {
    const config = loadConfig();
    const sender = event.sender;

    sender.send('script:log', { type: 'info', data: '자동 모드: 글 생성 시작...\n' });
    generateThenPost(config, sender, '자동 모드');
    return { started: true };
});

// 선택 계정 순차 자동 포스팅 (계정별 IP 변경 + 글 생성 + 포스팅)
let autoAllAborted = false;

ipcMain.handle('script:autoAll', async (event, selectedIds) => {
    const config = loadConfig();
    const sender = event.sender;
    const accountsData = loadNaverAccounts();
    // selectedIds가 있으면 해당 계정만, 없으면 전체
    const accounts = selectedIds && selectedIds.length > 0
        ? accountsData.accounts.filter(a => selectedIds.includes(a.id))
        : accountsData.accounts;
    autoAllAborted = false;

    if (accounts.length === 0) {
        sender.send('script:log', { type: 'stderr', data: '선택된 계정이 없습니다.\n' });
        sender.send('script:done', { code: 1, script: 'autoAll' });
        return { started: false };
    }

    sender.send('script:log', { type: 'info', data: `=== 선택 계정 자동 포스팅 시작 (${accounts.length}개 계정: ${accounts.map(a => a.id).join(', ')}) ===\n\n` });

    for (let idx = 0; idx < accounts.length; idx++) {
        if (autoAllAborted) {
            sender.send('script:log', { type: 'info', data: '\n사용자에 의해 중단되었습니다.\n' });
            break;
        }

        const account = accounts[idx];
        sender.send('script:log', { type: 'info', data: `\n======== [${idx + 1}/${accounts.length}] ${account.id} 계정 처리 시작 ========\n` });

        // 1. IP 변경
        sender.send('script:log', { type: 'info', data: `\n🔄 IP 변경 중...\n` });
        try {
            const interfaceName = null;
            const newIp = await ipChanger.changeIP(interfaceName, (msg) => {
                sender.send('script:log', { type: 'info', data: `  ${msg}\n` });
            });
            sender.send('script:log', { type: 'info', data: `✅ IP 변경 완료: ${newIp}\n\n` });
        } catch (e) {
            sender.send('script:log', { type: 'stderr', data: `⚠️ IP 변경 실패: ${e.message} (계속 진행합니다)\n\n` });
        }

        if (autoAllAborted) break;

        // 2. 글 생성 (generate_article.js)
        const generateSuccess = await new Promise((resolve) => {
            sender.send('script:log', { type: 'info', data: `📝 ${account.id} - 글 생성 시작...\n` });
            runScript('generate_article.js', config, {
                send: (channel, data) => {
                    if (channel === 'script:done') {
                        resolve(isResultValid());
                    } else {
                        sender.send(channel, data);
                    }
                }
            }, { id: account.id, pw: account.pw });
        });

        if (autoAllAborted) break;

        if (!generateSuccess) {
            sender.send('script:log', { type: 'stderr', data: `❌ ${account.id} - 글 생성 실패. 다음 계정으로 넘어갑니다.\n` });
            continue;
        }

        // 3. 포스팅 (3.post.js)
        sender.send('script:log', { type: 'info', data: `\n📤 ${account.id} - 포스팅 시작...\n` });
        await new Promise((resolve) => {
            setTimeout(() => {
                runScript('3.post.js', config, {
                    send: (channel, data) => {
                        if (channel === 'script:done') {
                            resolve();
                        } else {
                            sender.send(channel, data);
                        }
                    }
                }, { id: account.id, pw: account.pw });
            }, 1000);
        });

        if (autoAllAborted) break;

        sender.send('script:log', { type: 'info', data: `\n✅ ${account.id} 계정 포스팅 완료!\n` });

        // 다음 계정 전 5초 대기
        if (idx < accounts.length - 1) {
            sender.send('script:log', { type: 'info', data: `\n⏳ 다음 계정 처리 전 5초 대기...\n` });
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    sender.send('script:log', { type: 'info', data: `\n=== 전체 계정 자동 포스팅 완료 ===\n` });
    sender.send('script:done', { code: 0, script: 'autoAll' });
    return { started: true };
});

ipcMain.handle('script:stop', () => {
    autoAllAborted = true;
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

ipcMain.handle('keywords:addCustom', (_event, keywords) => {
    const merged = saveCustomKeywords(keywords);
    return { success: true, count: merged.length };
});

ipcMain.handle('keywords:remove', (_event, keyword) => {
    removeKeyword(keyword);
    return { success: true };
});

ipcMain.handle('history:load', () => {
    return loadHistory();
});

// ---- IP 변경 ----
ipcMain.handle('ip:check', async () => {
    const ip = await getPublicIP();
    return { ip: ip || '확인 불가' };
});

ipcMain.handle('ip:interfaces', () => {
    return ipChanger.listInterfaces();
});

ipcMain.handle('ip:change', async (event, interfaceName) => {
    const sender = event.sender;
    try {
        const newIp = await ipChanger.changeIP(interfaceName || null, (msg) => {
            sender.send('ip:log', { type: 'info', data: `${msg}\n` });
        });
        return { success: true, ip: newIp };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// ---- Naver Account Management ----
function getAccountsResponse() {
    const data = loadNaverAccounts();
    const accounts = data.accounts.map(a => ({
        ...a,
        pw: '****',
        cookieStatus: getNaverAccountCookieStatus(a.id)
    }));
    return { accounts, selectedId: data.selectedId };
}

ipcMain.handle('naver:loadAccounts', () => getAccountsResponse());

ipcMain.handle('naver:addAccount', (_event, { id, pw }) => {
    addNaverAccount(id, pw);
    return getAccountsResponse();
});

ipcMain.handle('naver:removeAccount', (_event, id) => {
    removeNaverAccount(id);
    return getAccountsResponse();
});

ipcMain.handle('naver:selectAccount', (_event, id) => {
    selectNaverAccount(id);
    return getAccountsResponse();
});

ipcMain.handle('naver:login', async (event, id) => {
    const sender = event.sender;
    const data = loadNaverAccounts();
    const account = data.accounts.find(a => a.id === id);
    if (!account) return { success: false, error: 'Account not found' };

    try {
        const puppeteer = require('puppeteer-core');
        const chromePath = findChromePath();
        if (!chromePath) {
            return { success: false, error: 'Chrome이 설치되어 있지 않습니다. Chrome을 먼저 설치해주세요.' };
        }
        sender.send('naver:loginLog', { type: 'info', data: `${id} 로그인 시도 중...\n` });

        const browser = await puppeteer.launch({
            headless: false,
            ignoreHTTPSErrors: true,
            defaultViewport: null,
            executablePath: chromePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                '--disable-automation',
                '--disable-blink-features=AutomationControlled',
                '--ignore-certificate-errors',
                '--start-maximized'
            ]
        });

        const page = await browser.newPage();
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        // Try loading existing cookies first
        const existingCookies = loadNaverCookies(id);
        if (existingCookies) {
            const cookies = Array.isArray(existingCookies) ? existingCookies : (existingCookies.cookies || []);
            if (cookies.length > 0) {
                await page.setCookie(...cookies);
                sender.send('naver:loginLog', { type: 'info', data: 'Existing cookies loaded, checking login status...\n' });
            }
        }

        // Check if already logged in
        await page.goto('https://www.naver.com', { waitUntil: 'networkidle0', timeout: 30000 });
        const loginButton = await page.$('.MyView-module__my_login___tOTgr');

        if (loginButton) {
            sender.send('naver:loginLog', { type: 'info', data: 'Login required, navigating to login page...\n' });
            await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle0', timeout: 30000 });
            await new Promise(r => setTimeout(r, 1000));

            await page.evaluate((uid, pw) => {
                document.querySelector('#id').value = uid;
                document.querySelector('#pw').value = pw;
            }, account.id, account.pw);

            const keepLogin = await page.$('#keep');
            if (keepLogin) {
                const isChecked = await page.evaluate(el => el.checked, keepLogin);
                if (!isChecked) await keepLogin.click();
            }

            const ipSecurity = await page.$('#switch');
            if (ipSecurity) {
                const isOn = await page.evaluate(el => el.value === 'on', ipSecurity);
                if (isOn) await ipSecurity.click();
            }

            await page.click('.btn_login');
            sender.send('naver:loginLog', { type: 'info', data: 'Login button clicked. Waiting...\n' });
            await new Promise(r => setTimeout(r, 3000));

            // Navigate to naver.com to verify + collect cookies
            await page.goto('https://www.naver.com', { waitUntil: 'networkidle0', timeout: 30000 });
            await new Promise(r => setTimeout(r, 2000));
        } else {
            sender.send('naver:loginLog', { type: 'info', data: 'Already logged in with cookies!\n' });
        }

        // Verify login success
        const stillNeedLogin = await page.$('.MyView-module__my_login___tOTgr');
        if (stillNeedLogin) {
            sender.send('naver:loginLog', { type: 'info', data: 'Waiting for manual login or captcha resolution...\n' });
            // Wait up to 120 seconds for manual login
            for (let i = 0; i < 60; i++) {
                await new Promise(r => setTimeout(r, 2000));
                await page.goto('https://www.naver.com', { waitUntil: 'networkidle0', timeout: 30000 });
                const check = await page.$('.MyView-module__my_login___tOTgr');
                if (!check) {
                    sender.send('naver:loginLog', { type: 'info', data: 'Login confirmed!\n' });
                    break;
                }
                if (i === 59) {
                    await browser.close();
                    return { success: false, error: 'Login timeout (2 minutes)' };
                }
            }
        }

        // Save cookies
        const cookies = await page.cookies();
        saveNaverCookies(id, cookies);
        sender.send('naver:loginLog', { type: 'info', data: `Cookies saved for ${id} (${cookies.length} cookies)\n` });

        await browser.close();
        return { success: true };
    } catch (err) {
        sender.send('naver:loginLog', { type: 'stderr', data: `Login error: ${err.message}\n` });
        return { success: false, error: err.message };
    }
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

ipcMain.handle('result:delete', () => {
    const resultPath = path.join(__dirname, '..', 'result.json');
    const imgsDir = path.join(__dirname, '..', 'imgs');
    try {
        if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
        if (fs.existsSync(imgsDir)) {
            fs.readdirSync(imgsDir).forEach(f => fs.unlinkSync(path.join(imgsDir, f)));
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});
