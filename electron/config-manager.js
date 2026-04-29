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
    scheduleMode: 'instant',
    scheduleDate: '',
    scheduleHour: '',
    scheduleMinute: '',
    activeProfileId: '1_loan'
};

// ===== Prompt Profiles =====
const MAX_PROFILES = 3;
const TEMPLATE_PROFILE_ID = '_template';
const SEED_PROFILES_DIR = path.join(APP_DIR, 'prompt', 'profiles');
const USER_PROFILES_DIR = path.join(USER_DATA_DIR, 'profiles');

function copyDirSync(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDirSync(s, d);
        else fs.copyFileSync(s, d);
    }
}

function seedProfilesIfNeeded() {
    if (!fs.existsSync(SEED_PROFILES_DIR)) return;
    if (!fs.existsSync(USER_PROFILES_DIR)) fs.mkdirSync(USER_PROFILES_DIR, { recursive: true });
    for (const entry of fs.readdirSync(SEED_PROFILES_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dest = path.join(USER_PROFILES_DIR, entry.name);
        if (!fs.existsSync(dest)) {
            copyDirSync(path.join(SEED_PROFILES_DIR, entry.name), dest);
        }
    }
}

function listProfiles() {
    seedProfilesIfNeeded();
    if (!fs.existsSync(USER_PROFILES_DIR)) return [];
    return fs.readdirSync(USER_PROFILES_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name !== TEMPLATE_PROFILE_ID)
        .map(e => {
            const metaPath = path.join(USER_PROFILES_DIR, e.name, 'profile.json');
            let name = e.name;
            try {
                if (fs.existsSync(metaPath)) {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                    if (meta && typeof meta.name === 'string' && meta.name.trim()) name = meta.name;
                }
            } catch (e) { /* ignore */ }
            return { id: e.name, name };
        })
        .sort((a, b) => a.id.localeCompare(b.id));
}

function getActiveProfileId() {
    const cfg = loadConfig();
    const profiles = listProfiles();
    if (profiles.length === 0) return null;
    if (cfg.activeProfileId && profiles.some(p => p.id === cfg.activeProfileId)) {
        return cfg.activeProfileId;
    }
    return profiles[0].id;
}

function setActiveProfileId(id) {
    const profiles = listProfiles();
    if (!profiles.some(p => p.id === id)) throw new Error(`프로필 "${id}"가 존재하지 않습니다.`);
    const cfg = loadConfig();
    cfg.activeProfileId = id;
    saveConfig(cfg);
    return id;
}

function getProfileDir(id) {
    return path.join(USER_PROFILES_DIR, id);
}

function getActiveProfileDir() {
    const id = getActiveProfileId();
    return id ? getProfileDir(id) : null;
}

function loadProfilePrompts(id) {
    const dir = getProfileDir(id);
    const infoPath = path.join(dir, 'info_Prompt.md');
    const imgPath = path.join(dir, 'img_Prompt.md');
    return {
        info: fs.existsSync(infoPath) ? fs.readFileSync(infoPath, 'utf-8') : '',
        img: fs.existsSync(imgPath) ? fs.readFileSync(imgPath, 'utf-8') : ''
    };
}

function saveProfilePrompt(id, type, content) {
    if (type !== 'info' && type !== 'img') throw new Error(`알 수 없는 프롬프트 유형: ${type}`);
    const dir = getProfileDir(id);
    if (!fs.existsSync(dir)) throw new Error(`프로필 "${id}"가 존재하지 않습니다.`);
    const filename = type === 'info' ? 'info_Prompt.md' : 'img_Prompt.md';
    fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}

function createProfile(name) {
    seedProfilesIfNeeded();
    const profiles = listProfiles();
    if (profiles.length >= MAX_PROFILES) {
        throw new Error(`프로필은 최대 ${MAX_PROFILES}개까지만 만들 수 있습니다.`);
    }
    const cleanName = (name || '').trim() || '새 프로필';
    // 다음 슬롯 번호 결정 (기존 1_, 2_, 3_ 중 비어있는 번호)
    const used = new Set(profiles.map(p => {
        const m = p.id.match(/^(\d+)_/);
        return m ? parseInt(m[1], 10) : null;
    }).filter(Boolean));
    let slot = 1;
    while (used.has(slot)) slot++;
    const id = `${slot}_custom`;
    const dest = path.join(USER_PROFILES_DIR, id);
    const templateDir = path.join(USER_PROFILES_DIR, TEMPLATE_PROFILE_ID);
    if (fs.existsSync(templateDir)) {
        copyDirSync(templateDir, dest);
    } else {
        fs.mkdirSync(dest, { recursive: true });
        fs.writeFileSync(path.join(dest, 'info_Prompt.md'), '', 'utf-8');
        fs.writeFileSync(path.join(dest, 'img_Prompt.md'), '', 'utf-8');
    }
    fs.writeFileSync(path.join(dest, 'profile.json'), JSON.stringify({ name: cleanName }, null, 2), 'utf-8');
    return { id, name: cleanName };
}

function renameProfile(id, name) {
    const dir = getProfileDir(id);
    if (!fs.existsSync(dir)) throw new Error(`프로필 "${id}"가 존재하지 않습니다.`);
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('프로필 이름은 비워둘 수 없습니다.');
    fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({ name: cleanName }, null, 2), 'utf-8');
    return { id, name: cleanName };
}

function deleteProfile(id) {
    const profiles = listProfiles();
    if (profiles.length <= 1) throw new Error('마지막 프로필은 삭제할 수 없습니다.');
    const dir = getProfileDir(id);
    if (!fs.existsSync(dir)) throw new Error(`프로필 "${id}"가 존재하지 않습니다.`);
    fs.rmSync(dir, { recursive: true, force: true });
    // 활성 프로필이 삭제되면 첫 번째로 전환
    const cfg = loadConfig();
    if (cfg.activeProfileId === id) {
        const remaining = listProfiles();
        if (remaining.length > 0) {
            cfg.activeProfileId = remaining[0].id;
            saveConfig(cfg);
        }
    }
}

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
    const activeId = getActiveProfileId();
    const promptPath = activeId
        ? path.join(getProfileDir(activeId), 'info_Prompt.md')
        : path.join(APP_DIR, 'prompt', 'prompt', 'info_Prompt.md');
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
        const raw = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
        const cookies = Array.isArray(raw) ? raw : (raw.cookies || []);
        const findCookie = (name) => cookies.find(c =>
            c.name === name && typeof c.domain === 'string' && c.domain.includes('naver.com')
        );
        const toExpiry = (cookie) => {
            if (!cookie || typeof cookie.expires !== 'number' || cookie.expires <= 0) return { at: null, days: null };
            const at = Math.floor(cookie.expires * 1000);
            return { at, days: Math.ceil((at - Date.now()) / 86400000) };
        };
        // 글쓰기 가능 여부의 기준은 NID_SES(세션). NID_AUT(자동 로그인)는 보조 정보.
        const ses = toExpiry(findCookie('NID_SES'));
        const aut = toExpiry(findCookie('NID_AUT'));
        const primary = ses.at !== null ? ses : aut;
        return {
            hasCookie: true,
            lastSaved: stat.mtime.toISOString(),
            expiresAt: primary.at,
            daysLeft: primary.days,
            sesExpiresAt: ses.at,
            sesDaysLeft: ses.days,
            autExpiresAt: aut.at,
            autDaysLeft: aut.days
        };
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
    getNaverAccountCookieStatus, saveNaverCookies, loadNaverCookies, getCookiesDir, getUserDataDir,
    // Profiles
    listProfiles, getActiveProfileId, setActiveProfileId, getActiveProfileDir, getProfileDir,
    loadProfilePrompts, saveProfilePrompt, createProfile, renameProfile, deleteProfile,
    seedProfilesIfNeeded, MAX_PROFILES
};
