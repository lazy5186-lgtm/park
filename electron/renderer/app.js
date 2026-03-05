// ===== Page Routing =====
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

function navigateTo(pageName) {
    navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageName));
    pages.forEach(page => page.classList.toggle('active', page.id === `page-${pageName}`));

    // Load page-specific data
    if (pageName === 'settings') loadSettings();
    if (pageName === 'keywords') loadKeywords();
    if (pageName === 'history') loadHistory();
    if (pageName === 'dashboard') loadDashboard();
}

navItems.forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
});

// ===== Toast =====
function showToast(message, type = '') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ===== Status indicator =====
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

function setRunning(running) {
    statusDot.classList.toggle('running', running);
    statusText.textContent = running ? '실행 중...' : '대기 중';

    // Toggle button states
    document.querySelectorAll('.btn-primary, .btn-accent').forEach(btn => {
        if (btn.type !== 'submit') btn.disabled = running;
    });
    document.querySelectorAll('.btn-danger').forEach(btn => {
        btn.disabled = !running;
    });
}

// ===== Log helper =====
function appendLog(containerId, data) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const span = document.createElement('span');
    if (data.type === 'stderr') span.className = 'log-stderr';
    if (data.type === 'info') span.className = 'log-info';
    span.textContent = data.data;
    el.appendChild(span);
    el.scrollTop = el.scrollHeight;

    // Also mirror to dashboard log
    if (containerId !== 'dashboardLog') {
        const dash = document.getElementById('dashboardLog');
        const clone = span.cloneNode(true);
        dash.appendChild(clone);
        dash.scrollTop = dash.scrollHeight;
    }
}

// Track which log container is active
let activeLogContainer = 'dashboardLog';

// ===== Script event listeners =====
window.api.script.onLog((data) => {
    appendLog(activeLogContainer, data);
    if (activeLogContainer !== 'dashboardLog') {
        appendLog('dashboardLog', data);
    }
});

window.api.script.onDone((data) => {
    setRunning(false);
    if (data.code === 0) {
        showToast(`${data.script} 완료`, 'success');
        // 글 생성 완료 시 결과 미리보기 로드
        if (data.script === 'generate_article.js') {
            loadResultPreview();
        }
    } else {
        showToast(`${data.script} 종료 (코드: ${data.code})`, 'error');
    }
});

// ===== Dashboard =====
async function loadDashboard() {
    try {
        const [kwData, history] = await Promise.all([
            window.api.keywords.load(),
            window.api.history.load()
        ]);

        const remaining = kwData.allKeywords.length - kwData.usedKeywords.length;
        document.getElementById('statKeywords').textContent = remaining >= 0 ? remaining : kwData.allKeywords.length;
        document.getElementById('statPosts').textContent = history.length;

        if (history.length > 0) {
            const last = history[0];
            document.getElementById('statLast').textContent = `${last.date} ${last.hour}:${last.minute}`;
        } else {
            document.getElementById('statLast').textContent = '없음';
        }
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

// Dashboard quick buttons
document.getElementById('quickGenerate').addEventListener('click', async () => {
    activeLogContainer = 'dashboardLog';
    setRunning(true);
    await window.api.script.generate();
});

document.getElementById('quickPost').addEventListener('click', async () => {
    activeLogContainer = 'dashboardLog';
    setRunning(true);
    await window.api.script.post();
});

document.getElementById('quickAuto').addEventListener('click', async () => {
    activeLogContainer = 'dashboardLog';
    setRunning(true);
    await window.api.script.auto();
});

// ===== Generate Page =====
document.getElementById('btnGenerate').addEventListener('click', async () => {
    activeLogContainer = 'generateLog';
    document.getElementById('generateLog').innerHTML = '';
    setRunning(true);
    await window.api.script.generate();
});

document.getElementById('btnStopGenerate').addEventListener('click', async () => {
    await window.api.script.stop();
    setRunning(false);
    showToast('프로세스 중지됨');
});

// ===== Posting Page =====
document.getElementById('btnPost').addEventListener('click', async () => {
    activeLogContainer = 'postLog';
    document.getElementById('postLog').innerHTML = '';
    setRunning(true);

    const mode = document.querySelector('input[name="postMode"]:checked').value;
    if (mode === 'auto') {
        await window.api.script.auto();
    } else {
        await window.api.script.post();
    }
});

document.getElementById('btnStopPost').addEventListener('click', async () => {
    await window.api.script.stop();
    setRunning(false);
    showToast('프로세스 중지됨');
});

// ===== Settings Page =====
async function loadSettings() {
    const config = await window.api.config.load();

    document.getElementById('cfgApiKey').value = config.geminiApiKey || '';
    document.getElementById('cfgTextModel').value = config.textModel || 'gemini-2.5-pro';
    document.getElementById('cfgImageModel').value = config.imageModel || 'gemini-3.1-flash-image-preview';
    document.getElementById('cfgNaverId').value = config.naverAccount?.id || '';
    document.getElementById('cfgNaverPw').value = config.naverAccount?.pw || '';
    document.getElementById('cfgKakaoLink').value = config.kakaoLink || '';
    document.getElementById('cfgOverlayKakao').value = config.overlay?.kakaoId || 'loandr_';
    document.getElementById('cfgOverlayPhone').value = config.overlay?.phone || '010-8442-4224';
    document.getElementById('cfgDelayMin').value = config.postingInterval?.min ?? 3.5;
    document.getElementById('cfgDelayMax').value = config.postingInterval?.max ?? 5;
    document.getElementById('cfgUseVideo').checked = config.useVideo || false;
    document.getElementById('cfgRandomTyping').checked = config.randomTyping || false;
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const config = {
        geminiApiKey: document.getElementById('cfgApiKey').value.trim(),
        textModel: document.getElementById('cfgTextModel').value,
        imageModel: document.getElementById('cfgImageModel').value,
        naverAccount: {
            id: document.getElementById('cfgNaverId').value.trim(),
            pw: document.getElementById('cfgNaverPw').value
        },
        kakaoLink: document.getElementById('cfgKakaoLink').value.trim(),
        overlay: {
            kakaoId: document.getElementById('cfgOverlayKakao').value.trim(),
            phone: document.getElementById('cfgOverlayPhone').value.trim()
        },
        postingInterval: {
            min: parseFloat(document.getElementById('cfgDelayMin').value) || 3.5,
            max: parseFloat(document.getElementById('cfgDelayMax').value) || 5
        },
        useVideo: document.getElementById('cfgUseVideo').checked,
        randomTyping: document.getElementById('cfgRandomTyping').checked
    };

    await window.api.config.save(config);
    showToast('설정이 저장되었습니다.', 'success');
});

// ===== Keywords Page =====
async function loadKeywords() {
    const data = await window.api.keywords.load();

    document.getElementById('kwTotalCount').textContent = data.allKeywords.length;
    document.getElementById('kwUsedCount').textContent = data.usedKeywords.length;

    const remaining = data.allKeywords.filter(k => !data.usedKeywords.includes(k));
    document.getElementById('kwRemainingCount').textContent = remaining.length;

    // All keywords
    const allList = document.getElementById('kwAllList');
    allList.innerHTML = data.allKeywords.map(k => {
        const used = data.usedKeywords.includes(k);
        return `<span class="kw-tag ${used ? 'used' : ''}">${k}</span>`;
    }).join('');

    // Used keywords
    const usedList = document.getElementById('kwUsedList');
    usedList.innerHTML = data.usedKeywords.length > 0
        ? data.usedKeywords.map(k => `<span class="kw-tag used">${k}</span>`).join('')
        : '<span class="empty-msg">아직 사용된 키워드가 없습니다.</span>';

    // Remaining keywords
    const remList = document.getElementById('kwRemainingList');
    remList.innerHTML = remaining.length > 0
        ? remaining.map(k => `<span class="kw-tag remaining">${k}</span>`).join('')
        : '<span class="empty-msg">모든 키워드가 사용되었습니다. 초기화가 필요합니다.</span>';
}

document.getElementById('btnResetKeywords').addEventListener('click', async () => {
    if (confirm('사용된 키워드를 초기화하시겠습니까?')) {
        await window.api.keywords.reset();
        await loadKeywords();
        showToast('키워드가 초기화되었습니다.', 'success');
    }
});

// ===== History Page =====
async function loadHistory() {
    const records = await window.api.history.load();
    const body = document.getElementById('historyBody');

    if (records.length === 0) {
        body.innerHTML = '<tr><td colspan="4" class="empty-msg">포스팅 기록이 없습니다.</td></tr>';
        return;
    }

    body.innerHTML = records.map(r =>
        `<tr>
            <td>${r.count}회</td>
            <td>${r.accountId}</td>
            <td>${r.date}</td>
            <td>${r.hour}:${r.minute}</td>
        </tr>`
    ).join('');
}

// ===== Result Preview =====
async function loadResultPreview() {
    const result = await window.api.result.load();
    const preview = document.getElementById('resultPreview');

    if (!result.exists) {
        preview.style.display = 'none';
        return;
    }

    preview.style.display = 'block';
    const data = result.data;

    // Title & subtitle
    document.getElementById('resultTitle').textContent = data.gemini?.h1 || '(제목 없음)';
    document.getElementById('resultSubtitle').textContent = data.gemini?.h3 || '';

    // Sections
    const sectionsEl = document.getElementById('resultSections');
    const sections = data.gemini?.sections || [];
    sectionsEl.innerHTML = sections.map(s => `
        <div class="result-section">
            <h4>${escapeHtml(s.h2 || '')}</h4>
            <p>${escapeHtml(s.p || '')}</p>
        </div>
    `).join('');

    // Keyword
    document.getElementById('resultKeyword').textContent = `키워드: ${data.키워드 || data.선택된상품명 || '-'}`;

    // Images
    const images = result.images || [];
    document.getElementById('resultImageCount').textContent = images.length;
    const imagesEl = document.getElementById('resultImages');
    imagesEl.innerHTML = images.map(img => `
        <div>
            <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" onclick="showImageModal(this.src)">
            <div class="result-img-name">${escapeHtml(img.name)}</div>
        </div>
    `).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showImageModal(src) {
    const modal = document.createElement('div');
    modal.className = 'img-modal';
    modal.innerHTML = `<img src="${src}">`;
    modal.addEventListener('click', () => modal.remove());
    document.body.appendChild(modal);
}

document.getElementById('btnRefreshResult').addEventListener('click', loadResultPreview);

// ===== Auto Update =====
window.api.update.onAvailable((data) => {
    const banner = document.getElementById('updateBanner');
    const message = document.getElementById('updateMessage');
    const progressBar = document.getElementById('updateProgressBar');

    banner.style.display = 'block';
    message.textContent = `새 버전 v${data.version} 다운로드 중...`;
    progressBar.style.display = 'block';
});

window.api.update.onProgress((data) => {
    const fill = document.getElementById('updateProgressFill');
    fill.style.width = `${data.percent}%`;
    const message = document.getElementById('updateMessage');
    message.textContent = `새 버전 다운로드 중... ${data.percent}%`;
});

window.api.update.onDownloaded((data) => {
    const message = document.getElementById('updateMessage');
    const progressBar = document.getElementById('updateProgressBar');
    const installBtn = document.getElementById('btnUpdateInstall');

    message.textContent = `v${data.version} 다운로드 완료!`;
    progressBar.style.display = 'none';
    installBtn.style.display = 'inline-flex';
});

document.getElementById('btnUpdateInstall').addEventListener('click', () => {
    window.api.update.install();
});

// ===== Init =====
loadDashboard();
// 페이지 로드 시 기존 result.json이 있으면 미리보기 표시
loadResultPreview();
