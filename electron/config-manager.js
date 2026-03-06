const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

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

    // 기존 설정 파일에서 초기값 로드 시도
    const config = { ...DEFAULT_CONFIG };
    try {
        const postIdPath = path.join(__dirname, '..', 'settings', 'post_id.txt');
        if (fs.existsSync(postIdPath)) {
            const lines = fs.readFileSync(postIdPath, 'utf-8').split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const [id, ...pwParts] = trimmed.split(':');
                    if (id && pwParts.length > 0) {
                        config.naverAccount = { id: id.trim(), pw: pwParts.join(':').trim() };
                        break;
                    }
                }
            }
        }
    } catch (e) { /* ignore */ }

    return config;
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function loadKeywords() {
    const promptPath = path.join(__dirname, '..', 'prompt', 'prompt', 'info_Prompt.md');
    const usedPath = path.join(__dirname, '..', 'used_keywords.json');

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
            // 대체: 줄단위 키워드 추출 시도
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

    // custom_keywords.json 에서 추가 키워드 읽기
    try {
        const customPath = path.join(__dirname, '..', 'custom_keywords.json');
        if (fs.existsSync(customPath)) {
            const custom = JSON.parse(fs.readFileSync(customPath, 'utf-8'));
            if (Array.isArray(custom)) {
                allKeywords = [...allKeywords, ...custom.filter(k => k && !allKeywords.includes(k))];
            }
        }
    } catch (e) { /* ignore */ }

    // removed_keywords.json 에서 삭제된 키워드 필터링
    let removedKeywords = [];
    try {
        const removedPath = path.join(__dirname, '..', 'removed_keywords.json');
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
    const usedPath = path.join(__dirname, '..', 'used_keywords.json');
    fs.writeFileSync(usedPath, '[]', 'utf-8');
}

function removeKeyword(keyword) {
    // custom_keywords.json에서 제거
    const customPath = path.join(__dirname, '..', 'custom_keywords.json');
    try {
        if (fs.existsSync(customPath)) {
            let custom = JSON.parse(fs.readFileSync(customPath, 'utf-8'));
            custom = custom.filter(k => k !== keyword);
            fs.writeFileSync(customPath, JSON.stringify(custom, null, 2), 'utf-8');
        }
    } catch (e) { /* ignore */ }

    // removed_keywords.json에 추가 (프롬프트 키워드 차단용)
    const removedPath = path.join(__dirname, '..', 'removed_keywords.json');
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
    const customPath = path.join(__dirname, '..', 'custom_keywords.json');
    let existing = [];
    try {
        if (fs.existsSync(customPath)) {
            existing = JSON.parse(fs.readFileSync(customPath, 'utf-8'));
        }
    } catch (e) { /* ignore */ }
    const merged = [...existing, ...keywords.filter(k => k && !existing.includes(k))];
    fs.writeFileSync(customPath, JSON.stringify(merged, null, 2), 'utf-8');

    // removed_keywords.json에서 다시 추가된 키워드 제거 (복원)
    const removedPath = path.join(__dirname, '..', 'removed_keywords.json');
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
    const postedDir = path.join(__dirname, '..', 'posted');
    const records = [];

    try {
        if (!fs.existsSync(postedDir)) return records;
        const files = fs.readdirSync(postedDir).filter(f => f.endsWith('_posted.txt'));
        for (const file of files) {
            const accountId = file.replace('_posted.txt', '');
            const content = fs.readFileSync(path.join(postedDir, file), 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            for (const line of lines) {
                // Format: 1회:2026-03-05:12:40분:URL (URL은 선택)
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
    return path.join(__dirname, '..', 'naver_accounts.json');
}

function getCookiesDir() {
    const dir = path.join(__dirname, '..', 'cookies');
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
    // Remove cookie file
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

module.exports = {
    loadConfig, saveConfig, loadKeywords, resetKeywords, removeKeyword, saveCustomKeywords, loadHistory,
    loadNaverAccounts, saveNaverAccounts, addNaverAccount, removeNaverAccount, selectNaverAccount,
    getNaverAccountCookieStatus, saveNaverCookies, loadNaverCookies, getCookiesDir
};
