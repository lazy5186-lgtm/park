const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const DEFAULT_CONFIG = {
    geminiApiKey: '',
    naverAccount: { id: '', pw: '' },
    kakaoLink: '',
    overlay: { kakaoId: 'loandr_', phone: '010-8442-4224' },
    imageModel: 'gemini-3.1-flash-image-preview',
    textModel: 'gemini-2.5-pro',
    postingInterval: { min: 3.5, max: 5 },
    useVideo: false,
    randomTyping: false
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
                // Format: 1회:2026-03-05:12:40분
                const match = line.match(/(\d+)회:(\d{4}-\d{2}-\d{2}):(\d+):(\d+)분/);
                if (match) {
                    records.push({
                        accountId,
                        count: parseInt(match[1]),
                        date: match[2],
                        hour: match[3],
                        minute: match[4]
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

module.exports = { loadConfig, saveConfig, loadKeywords, resetKeywords, loadHistory };
