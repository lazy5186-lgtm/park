const fs = require('fs');
const path = require('path');

// 유저 데이터 경로: %APPDATA%/N_blog_auto (업데이트해도 유지됨)
// Electron app이 초기화되기 전에는 fallback 사용
let USER_DATA_DIR;
try {
    const { app } = require('electron');
    USER_DATA_DIR = path.join(app.getPath('userData'));
} catch (e) {
    // Electron app이 아직 준비 안 된 경우 fallback
    USER_DATA_DIR = path.join(process.env.APPDATA || path.join(require('os').homedir(), '.config'), 'N_blog_auto');
}

// 앱 리소스 경로 (프롬프트 등 읽기 전용 파일)
const APP_DIR = path.join(__dirname, '..');

// 유저 데이터 폴더 생성
if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });

const CONFIG_PATH = path.join(USER_DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
    geminiApiKey: '',
    naverAccount: { id: '', pw: '' },
    kakaoLink: '',
    overlay: { kakaoId: 'loandr_', phone: '010-8442-4224' },
    imageModel: 'gemini-2.5-flash-image',
    textModel: 'gemini-3-flash-preview',
    imageCount: 0,
    scheduleMode: 'manual',
    scheduleDate: '',
    scheduleHour: '',
    scheduleMinute: ''
};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
            const saved = JSON.parse(raw);
            return { ...DEFAULT_CONFIG, ...saved };
        }
    } catch (err) {
        console.error('config.json 읽기 오류:', err.message);
    }
    return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function loadKeywords() {
    const promptPath = path.join(APP_DIR, 'prompt', 'prompt', 'info_Prompt.md');
    const usedPath = path.join(USER_DATA_DIR, 'used_keywords.json');

    let allKeywords = [];
    let usedKeywords = [];

    try {
        const promptContent = fs.readFileSync(promptPath, 'utf-8');
        const match = promptContent.match(/\[키워드\s*풀\]([\s\S]*?)(?=\n#|\n\[|$)/i)
            || promptContent.match(/키워드\s*풀[^\n]*\n([\s\S]*?)(?=\n#|\n\[|$)/i);
        if (match) {
            allKeywords = match[1].split(',').map(k => k.trim()).filter(k => k.length > 0);
        }
        if (allKeywords.length === 0) {
            const lines = promptContent.split('\n');
            for (const line of lines) {
                if (line.includes(',') && !line.startsWith('#')) {
                    const candidates = line.split(',').map(k => k.trim()).filter(k => k.length > 0 && k.length < 30);
                    if (candidates.length >= 5) {
                        allKeywords = candidates;
                        break;
                    }
                }
            }
        }
    } catch (e) { /* ignore */ }

    // custom_keywords.json
    try {
        const customPath = path.join(USER_DATA_DIR, 'custom_keywords.json');
        if (fs.existsSync(customPath)) {
            const custom = JSON.parse(fs.readFileSync(customPath, 'utf-8'));
            if (Array.isArray(custom)) {
                allKeywords = [...allKeywords, ...custom.filter(k => k && !allKeywords.includes(k))];
            }
        }
    } catch (e) { /* ignore */ }

    // removed_keywords.json
    let removedKeywords = [];
    try {
        const removedPath = path.join(USER_DATA_DIR, 'removed_keywords.json');
        if (fs.existsSync(removedPath)) {
            removedKeywords = JSON.parse(fs.readFileSync(removedPath, 'utf-8'));
        }
    } catch (e) { /* ignore */ }
    if (removedKeywords.length > 0) {
        allKeywords = allKeywords.filter(k => !removedKeywords.includes(k));
    }

    try {
        if (fs.existsSync(usedPath)) {
            usedKeywords = JSON.parse(fs.readFileSync(usedPath, 'utf-8'));
        }
    } catch (e) { /* ignore */ }

    return { allKeywords, usedKeywords };
}

function resetKeywords() {
    const usedPath = path.join(USER_DATA_DIR, 'used_keywords.json');
    fs.writeFileSync(usedPath, '[]', 'utf-8');
}

function removeKeyword(keyword) {
    const customPath = path.join(USER_DATA_DIR, 'custom_keywords.json');
    try {
        if (fs.existsSync(customPath)) {
            let custom = JSON.parse(fs.readFileSync(customPath, 'utf-8'));
            custom = custom.filter(k => k !== keyword);
            fs.writeFileSync(customPath, JSON.stringify(custom, null, 2), 'utf-8');
        }
    } catch (e) { /* ignore */ }

    const removedPath = path.join(USER_DATA_DIR, 'removed_keywords.json');
    let removed = [];
    try {
        if (fs.existsSync(removedPath)) {
            removed = JSON.parse(fs.readFileSync(removedPath, 'utf-8'));
        }
    } catch (e) { /* ignore */ }
    if (!removed.includes(keyword)) {
        removed.push(keyword);
        fs.writeFileSync(removedPath, JSON.stringify(removed, null, 2), 'utf-8');
    }
}

function saveCustomKeywords(keywords) {
    const customPath = path.join(USER_DATA_DIR, 'custom_keywords.json');
    let existing = [];
    try {
        if (fs.existsSync(customPath)) {
            existing = JSON.parse(fs.readFileSync(customPath, 'utf-8'));
        }
    } catch (e) { /* ignore */ }
    const merged = [...existing, ...keywords.filter(k => k && !existing.includes(k))];
    fs.writeFileSync(customPath, JSON.stringify(merged, null, 2), 'utf-8');

    const removedPath = path.join(USER_DATA_DIR, 'removed_keywords.json');
    try {
        if (fs.existsSync(removedPath)) {
            let removed = JSON.parse(fs.readFileSync(removedPath, 'utf-8'));
            removed = removed.filter(k => !keywords.includes(k));
            fs.writeFileSync(removedPath, JSON.stringify(removed, null, 2), 'utf-8');
        }
    } catch (e) { /* ignore */ }

    return merged;
}

function loadHistory() {
    const postedDir = path.join(USER_DATA_DIR, 'posted');
    const records = [];

    try {
        if (!fs.existsSync(postedDir)) return records;
        const files = fs.readdirSync(postedDir).filter(f => f.endsWith('_posted.txt'));
        for (const file of files) {
            const accountId = file.replace('_posted.txt', '');
            const content = fs.readFileSync(path.join(postedDir, file), 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            for (const line of lines) {
                const match = line.match(/(\d+)회:(\d{4}-\d{2}-\d{2}):(\d+):(\d+)분(?::(.+))?/);
                if (match) {
                    records.push({
                        accountId,
                        count: parseInt(match[1]),
                        date: match[2],
                        hour: match[3],
                        minute: match[4],
                        url: match[5] || ''
                    });
                }
            }
        }
    } catch (e) { /* ignore */ }

    return records.sort((a, b) => {
        const da = `${a.date} ${a.hour}:${a.minute}`;
        const db = `${b.date} ${b.hour}:${b.minute}`;
        return db.localeCompare(da);
    });
}

// ---- Naver Account Management ----
function getNaverAccountsPath() {
    return path.join(USER_DATA_DIR, 'naver_accounts.json');
}

function getCookiesDir() {
    const dir = path.join(USER_DATA_DIR, 'cookies');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function loadNaverAccounts() {
    try {
        const p = getNaverAccountsPath();
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
    } catch (e) { /* ignore */ }
    return { accounts: [], selectedId: null };
}

function saveNaverAccounts(data) {
    fs.writeFileSync(getNaverAccountsPath(), JSON.stringify(data, null, 2), 'utf-8');
}

function addNaverAccount(id, pw) {
    const data = loadNaverAccounts();
    const existing = data.accounts.find(a => a.id === id);
    if (existing) {
        existing.pw = pw;
    } else {
        data.accounts.push({ id, pw });
    }
    if (!data.selectedId) data.selectedId = id;
    saveNaverAccounts(data);
    return data;
}

function removeNaverAccount(id) {
    const data = loadNaverAccounts();
    data.accounts = data.accounts.filter(a => a.id !== id);
    if (data.selectedId === id) {
        data.selectedId = data.accounts.length > 0 ? data.accounts[0].id : null;
    }
    const cookiePath = path.join(getCookiesDir(), `${id}_cookies.json`);
    if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
    saveNaverAccounts(data);
    return data;
}

function selectNaverAccount(id) {
    const data = loadNaverAccounts();
    if (data.accounts.find(a => a.id === id)) {
        data.selectedId = id;
        saveNaverAccounts(data);
    }
    return data;
}

function getNaverAccountCookieStatus(id) {
    const cookiePath = path.join(getCookiesDir(), `${id}_cookies.json`);
    if (!fs.existsSync(cookiePath)) return { hasCookie: false };
    try {
        const stat = fs.statSync(cookiePath);
        return { hasCookie: true, lastSaved: stat.mtime.toISOString() };
    } catch (e) {
        return { hasCookie: false };
    }
}

function saveNaverCookies(id, cookies) {
    const cookiePath = path.join(getCookiesDir(), `${id}_cookies.json`);
    fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2), 'utf-8');
}

function loadNaverCookies(id) {
    const cookiePath = path.join(getCookiesDir(), `${id}_cookies.json`);
    if (!fs.existsSync(cookiePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    } catch (e) {
        return null;
    }
}

function getUserDataDir() {
    return USER_DATA_DIR;
}

module.exports = {
    loadConfig, saveConfig, loadKeywords, resetKeywords, removeKeyword, saveCustomKeywords, loadHistory,
    loadNaverAccounts, saveNaverAccounts, addNaverAccount, removeNaverAccount, selectNaverAccount,
    getNaverAccountCookieStatus, saveNaverCookies, loadNaverCookies, getCookiesDir, getUserDataDir
};
