// ===== Page Routing =====
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

function navigateTo(pageName) {
    navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageName));
    pages.forEach(page => page.classList.toggle('active', page.id === `page-${pageName}`));

    // Load page-specific data
    if (pageName === 'dashboard') { loadDashboard(); loadSettings(); }
    if (pageName === 'keywords') loadKeywords();
    if (pageName === 'history') loadHistory();
    if (pageName === 'posting') { loadSettings(); loadDraftStatus(); loadResultPreview(); loadAccountCheckboxes(); }
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
}

// ===== Script event listeners =====
window.api.script.onLog((data) => {
    appendLog('postLog', data);
});

window.api.script.onDone((data) => {
    setRunning(false);
    if (data.code === 0) {
        showToast(`${data.script} 완료`, 'success');
        // 글 생성 완료 시 결과 미리보기 + 임시저장 상태 로드
        if (data.script === 'generate_article.js') {
            loadDraftStatus();
            loadResultPreview();
        }
        // 포스팅 완료 시 기록 새로고침 + 임시저장 상태 갱신
        if (data.script === '3.post.js') {
            loadDashboard();
            loadDraftStatus();
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

// ===== Draft Status =====
async function loadDraftStatus() {
    const result = await window.api.result.load();
    const el = document.getElementById('draftStatus');

    if (result.exists && result.data.gemini && result.data.gemini.h1) {
        const d = result.data;
        const imgCount = (result.images || []).length;
        const sectionCount = (d.gemini.sections || []).length;
        document.getElementById('draftTitle').textContent = d.gemini.h1;
        document.getElementById('draftMeta').textContent =
            `키워드: ${d.키워드 || '-'} · 섹션 ${sectionCount}개 · 이미지 ${imgCount}장`;
        el.style.display = 'flex';
    } else {
        el.style.display = 'none';
    }
}

document.getElementById('btnPostDraft').addEventListener('click', async () => {
    document.getElementById('postLog').innerHTML = '';
    setRunning(true);
    await window.api.script.postDraft();
});

document.getElementById('btnDeleteDraft').addEventListener('click', async () => {
    if (!confirm('임시 저장된 글을 삭제하시겠습니까?')) return;
    await window.api.result.delete();
    loadDraftStatus();
    loadResultPreview();
    showToast('임시 저장 글이 삭제되었습니다.', 'success');
});

// ===== Posting Page (통합) =====

// 계정 체크박스 로드
async function loadAccountCheckboxes() {
    const data = await window.api.naver.loadAccounts();
    const list = document.getElementById('accountCheckboxList');
    list.innerHTML = '';
    data.accounts.forEach(a => {
        const chip = document.createElement('label');
        chip.className = 'account-chip active';
        chip.style.cssText = 'display:inline-flex; align-items:center; gap:4px; font-size:12px; padding:5px 12px; border-radius:16px; cursor:pointer; user-select:none; transition:all .15s; border:1px solid #4a9eff; background:#4a9eff; color:#fff;';
        chip.innerHTML = `<input type="checkbox" value="${a.id}" checked style="display:none;"> ${a.id}`;
        const cb = chip.querySelector('input');
        cb.addEventListener('change', () => {
            if (cb.checked) {
                chip.style.background = '#4a9eff';
                chip.style.borderColor = '#4a9eff';
                chip.style.color = '#fff';
            } else {
                chip.style.background = 'transparent';
                chip.style.borderColor = 'var(--border-color, #ddd)';
                chip.style.color = 'var(--text-secondary, #888)';
            }
        });
        chip.addEventListener('click', (e) => {
            if (e.target !== cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        });
        list.appendChild(chip);
    });
}

// autoAll 모드 선택 시 계정 선택 영역 표시/숨김
document.querySelectorAll('input[name="postMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const area = document.getElementById('accountSelectArea');
        area.style.display = radio.value === 'autoAll' && radio.checked ? 'block' : 'none';
        if (radio.value === 'autoAll' && radio.checked) loadAccountCheckboxes();
    });
});

// 전체 선택 토글
document.getElementById('accountSelectAll').addEventListener('change', (e) => {
    document.querySelectorAll('#accountCheckboxList input[type="checkbox"]').forEach(cb => {
        cb.checked = e.target.checked;
        cb.dispatchEvent(new Event('change'));
    });
});
document.querySelector('label:has(#accountSelectAll)').addEventListener('click', (e) => {
    const cb = document.getElementById('accountSelectAll');
    if (e.target !== cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
});

document.getElementById('btnPost').addEventListener('click', async () => {
    document.getElementById('postLog').innerHTML = '';
    setRunning(true);

    const mode = document.querySelector('input[name="postMode"]:checked').value;
    if (mode === 'generate') {
        await window.api.script.generate();
    } else if (mode === 'auto') {
        const result = await window.api.result.load();
        if (result.exists) {
            if (confirm('임시 저장된 글이 있습니다.\n\n확인 → 이 글을 바로 포스팅\n취소 → 새로 생성 후 포스팅')) {
                await window.api.script.postDraft();
            } else {
                await window.api.script.auto();
            }
        } else {
            await window.api.script.auto();
        }
    } else if (mode === 'autoAll') {
        const checked = document.querySelectorAll('#accountCheckboxList input[type="checkbox"]:checked');
        const selectedIds = Array.from(checked).map(cb => cb.value);
        if (selectedIds.length === 0) {
            alert('실행할 계정을 선택해주세요.');
            setRunning(false);
            return;
        }
        await window.api.script.autoAll(selectedIds);
    } else {
        // post 모드: result.json 없으면 main.js에서 자동 생성 처리
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
    document.getElementById('cfgTextModel').value = config.textModel || 'gemini-3-flash-preview';
    document.getElementById('cfgImageModel').value = config.imageModel || 'gemini-2.5-flash-image';
    document.getElementById('cfgImageCount').value = String(config.imageCount || 0);
    // Naver accounts are now managed separately via naver account list
    // kakaoLink 제거됨
    document.getElementById('cfgOverlayKakao').value = config.overlay?.kakaoId || 'loandr_';
    document.getElementById('cfgOverlayPhone').value = config.overlay?.phone || '010-8442-4224';

    // 발행 모드 (auto는 이제 없으므로 manual로 폴백)
    let mode = config.scheduleMode || 'manual';
    if (mode === 'auto') mode = 'manual';
    const radio = document.querySelector(`input[name="scheduleMode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    toggleScheduleFields(mode);

    document.getElementById('cfgScheduleDate').value = config.scheduleDate || '';
    document.getElementById('cfgScheduleHour').value = config.scheduleHour || '';
    document.getElementById('cfgScheduleMinute').value = config.scheduleMinute || '';
}

function toggleScheduleFields(mode) {
    document.getElementById('scheduleFields').style.display = mode === 'instant' ? 'none' : 'flex';
}

document.querySelectorAll('input[name="scheduleMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => toggleScheduleFields(e.target.value));
});

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const config = {
        geminiApiKey: document.getElementById('cfgApiKey').value.trim(),
        textModel: document.getElementById('cfgTextModel').value,
        imageModel: document.getElementById('cfgImageModel').value,
        imageCount: parseInt(document.getElementById('cfgImageCount').value) || 0,
        overlay: {
            kakaoId: document.getElementById('cfgOverlayKakao').value.trim(),
            phone: document.getElementById('cfgOverlayPhone').value.trim()
        },
        scheduleMode: document.querySelector('input[name="scheduleMode"]:checked')?.value || 'manual',
        scheduleDate: document.getElementById('cfgScheduleDate').value || '',
        scheduleHour: document.getElementById('cfgScheduleHour').value || '',
        scheduleMinute: document.getElementById('cfgScheduleMinute').value || ''
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

    // All keywords (with delete button)
    const allList = document.getElementById('kwAllList');
    allList.innerHTML = data.allKeywords.map(k => {
        const used = data.usedKeywords.includes(k);
        return `<span class="kw-tag ${used ? 'used' : ''}">${escapeHtml(k)}<button class="kw-delete" data-keyword="${escapeHtml(k)}">&times;</button></span>`;
    }).join('');

    // Attach delete handlers
    allList.querySelectorAll('.kw-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const keyword = btn.dataset.keyword;
            await window.api.keywords.remove(keyword);
            await loadKeywords();
            showToast(`"${keyword}" 삭제됨`, 'success');
        });
    });

    // Used keywords
    const usedList = document.getElementById('kwUsedList');
    usedList.innerHTML = data.usedKeywords.length > 0
        ? data.usedKeywords.map(k => `<span class="kw-tag used">${escapeHtml(k)}</span>`).join('')
        : '<span class="empty-msg">아직 사용된 키워드가 없습니다.</span>';

    // Remaining keywords
    const remList = document.getElementById('kwRemainingList');
    remList.innerHTML = remaining.length > 0
        ? remaining.map(k => `<span class="kw-tag remaining">${escapeHtml(k)}</span>`).join('')
        : '<span class="empty-msg">모든 키워드가 사용되었습니다. 초기화가 필요합니다.</span>';
}

document.getElementById('btnResetKeywords').addEventListener('click', async () => {
    if (confirm('사용된 키워드를 초기화하시겠습니까?')) {
        await window.api.keywords.reset();
        await loadKeywords();
        showToast('키워드가 초기화되었습니다.', 'success');
    }
});

document.getElementById('btnAddCustomKeywords').addEventListener('click', async () => {
    const input = document.getElementById('kwCustomInput').value.trim();
    if (!input) return showToast('키워드를 입력해주세요.', 'error');

    const keywords = input.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (keywords.length === 0) return showToast('유효한 키워드가 없습니다.', 'error');

    await window.api.keywords.addCustom(keywords);
    document.getElementById('kwCustomInput').value = '';
    await loadKeywords();
    showToast(`${keywords.length}개 키워드가 추가되었습니다.`, 'success');
});

// ===== History Page =====
async function loadHistory() {
    const records = await window.api.history.load();
    const body = document.getElementById('historyBody');

    if (records.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="empty-msg">포스팅 기록이 없습니다.</td></tr>';
        return;
    }

    body.innerHTML = records.map(r => {
        const linkCell = r.url
            ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener" style="color:var(--cerulean); text-decoration:underline; cursor:pointer; font-size:12px;">보기</a>`
            : '<span style="color:var(--text-muted);">-</span>';
        return `<tr>
            <td>${r.count}회</td>
            <td>${r.accountId}</td>
            <td>${r.date}</td>
            <td>${r.hour}:${r.minute}</td>
            <td>${linkCell}</td>
        </tr>`;
    }).join('');
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

// ===== IP 로그 =====
window.api.ip.onLog((data) => {
    appendLog('ipLog', data);
});

// ===== IP 변경 =====
async function loadInterfaces() {
    const list = await window.api.ip.interfaces();
    const select = document.getElementById('cfgInterfaceName');
    const currentVal = select.value;
    select.innerHTML = '<option value="">자동 감지</option>';
    list.forEach(iface => {
        const opt = document.createElement('option');
        opt.value = iface.name;
        opt.textContent = `${iface.name} (${iface.ip})`;
        select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
}

document.getElementById('btnCheckIp').addEventListener('click', async () => {
    document.getElementById('currentIp').textContent = '확인 중...';
    const result = await window.api.ip.check();
    document.getElementById('currentIp').textContent = result.ip;
});

document.getElementById('btnRefreshInterfaces').addEventListener('click', async () => {
    await loadInterfaces();
    showToast('인터페이스 목록 갱신', 'success');
});

document.getElementById('btnChangeIp').addEventListener('click', async () => {
    const btn = document.getElementById('btnChangeIp');
    btn.disabled = true;
    btn.textContent = 'IP 변경 중...';
    document.getElementById('currentIp').textContent = '변경 중...';

    const interfaceName = document.getElementById('cfgInterfaceName').value || '';
    const result = await window.api.ip.change(interfaceName);

    if (result.success) {
        document.getElementById('currentIp').textContent = result.ip || '확인 불가';
        showToast(`IP 변경 완료: ${result.ip}`, 'success');
    } else {
        document.getElementById('currentIp').textContent = '변경 실패';
        showToast(`IP 변경 실패: ${result.error}`, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined">swap_vert</span> IP 변경';
});

// ===== Version & Update =====
async function loadVersion() {
    const version = await window.api.app.getVersion();
    document.getElementById('appVersion').textContent = version;
}

document.getElementById('btnCheckUpdate').addEventListener('click', async () => {
    const statusEl = document.getElementById('versionStatus');
    statusEl.className = 'version-status updating';
    statusEl.textContent = '확인 중...';
    document.getElementById('btnCheckUpdate').disabled = true;
    await window.api.update.check();
});

window.api.update.onNotAvailable(() => {
    const statusEl = document.getElementById('versionStatus');
    statusEl.className = 'version-status latest';
    statusEl.textContent = '최신 버전입니다.';
    document.getElementById('btnCheckUpdate').disabled = false;
});

window.api.update.onError((data) => {
    const statusEl = document.getElementById('versionStatus');
    statusEl.className = 'version-status';
    statusEl.textContent = '업데이트 확인 실패';
    document.getElementById('btnCheckUpdate').disabled = false;
});

// ===== Auto Update =====
window.api.update.onAvailable((data) => {
    const banner = document.getElementById('updateBanner');
    const message = document.getElementById('updateMessage');
    const progressBar = document.getElementById('updateProgressBar');

    banner.style.display = 'block';
    message.textContent = `새 버전 v${data.version} 다운로드 중...`;
    progressBar.style.display = 'block';

    const statusEl = document.getElementById('versionStatus');
    statusEl.className = 'version-status updating';
    statusEl.textContent = `v${data.version} 다운로드 중...`;
    document.getElementById('btnCheckUpdate').disabled = true;
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

    const statusEl = document.getElementById('versionStatus');
    statusEl.className = 'version-status latest';
    statusEl.textContent = `v${data.version} 업데이트 준비 완료`;
});

document.getElementById('btnUpdateInstall').addEventListener('click', () => {
    window.api.update.install();
});

// ===== Naver Account Management =====
async function loadNaverAccounts() {
    const data = await window.api.naver.loadAccounts();
    renderNaverAccounts(data);
}

function renderNaverAccounts(data) {
    const list = document.getElementById('naverAccountList');
    if (!data.accounts || data.accounts.length === 0) {
        list.innerHTML = '<p class="empty-msg">등록된 계정이 없습니다.</p>';
        return;
    }

    list.innerHTML = data.accounts.map(a => {
        const isSelected = a.id === data.selectedId;
        const cookieLabel = a.cookieStatus?.hasCookie
            ? `<span class="cookie-status valid">쿠키 저장됨</span>`
            : `<span class="cookie-status">쿠키 없음</span>`;

        return `<div class="naver-account-item ${isSelected ? 'selected' : ''}">
            <div class="account-info">
                <span class="account-id">${escapeHtml(a.id)}</span>
                ${cookieLabel}
                ${isSelected ? '<span style="color:var(--cerulean); font-size:11px; font-weight:600;">선택됨</span>' : ''}
            </div>
            <div class="account-actions">
                <button class="btn-select" title="이 계정 선택" data-id="${escapeHtml(a.id)}">
                    <span class="material-symbols-outlined" style="font-size:18px;">check_circle</span>
                </button>
                <button title="로그인 (쿠키 저장)" data-login-id="${escapeHtml(a.id)}">
                    <span class="material-symbols-outlined" style="font-size:18px;">login</span>
                </button>
                <button class="btn-delete" title="삭제" data-remove-id="${escapeHtml(a.id)}">
                    <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
                </button>
            </div>
        </div>`;
    }).join('');

    // Attach event handlers
    list.querySelectorAll('.btn-select').forEach(btn => {
        btn.addEventListener('click', async () => {
            const result = await window.api.naver.selectAccount(btn.dataset.id);
            renderNaverAccounts(result);
            showToast(`${btn.dataset.id} 선택됨`, 'success');
        });
    });

    list.querySelectorAll('[data-login-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.loginId;
            btn.disabled = true;
            showToast(`${id} 로그인 중...`);
            const result = await window.api.naver.login(id);
            btn.disabled = false;
            if (result.success) {
                showToast(`${id} 쿠키 저장 완료!`, 'success');
                await loadNaverAccounts();
            } else {
                showToast(`로그인 실패: ${result.error}`, 'error');
            }
        });
    });

    list.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const result = await window.api.naver.removeAccount(btn.dataset.removeId);
            renderNaverAccounts(result);
            showToast('계정 삭제됨', 'success');
        });
    });
}

document.getElementById('btnAddNaverAccount').addEventListener('click', async () => {
    const id = document.getElementById('cfgNaverIdNew').value.trim();
    const pw = document.getElementById('cfgNaverPwNew').value;
    if (!id || !pw) return showToast('아이디와 비밀번호를 입력해주세요.', 'error');

    const result = await window.api.naver.addAccount(id, pw);
    renderNaverAccounts(result);
    document.getElementById('cfgNaverIdNew').value = '';
    document.getElementById('cfgNaverPwNew').value = '';
    showToast(`${id} 계정 추가됨`, 'success');
});

document.getElementById('btnNaverLogin').addEventListener('click', async () => {
    const id = document.getElementById('cfgNaverIdNew').value.trim();
    const pw = document.getElementById('cfgNaverPwNew').value;
    if (!id || !pw) return showToast('아이디와 비밀번호를 입력해주세요.', 'error');

    // Add account first, then login
    await window.api.naver.addAccount(id, pw);
    showToast(`${id} 로그인 중...`);
    const result = await window.api.naver.login(id);
    if (result.success) {
        showToast(`${id} 로그인 + 쿠키 저장 완료!`, 'success');
    } else {
        showToast(`로그인 실패: ${result.error}`, 'error');
    }
    document.getElementById('cfgNaverIdNew').value = '';
    document.getElementById('cfgNaverPwNew').value = '';
    await loadNaverAccounts();
});

window.api.naver.onLoginLog((data) => {
    appendLog('postLog', data);
});

// ===== Init =====
loadVersion();
loadDashboard();
loadSettings();
loadDraftStatus();
loadNaverAccounts();
loadInterfaces();
window.api.ip.check().then(r => {
    document.getElementById('currentIp').textContent = r.ip;
});
