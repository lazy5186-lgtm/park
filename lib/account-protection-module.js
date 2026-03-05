const fs = require('fs');
const path = require('path');

// 계정 보호 조치 감지 및 처리 모듈

/**
 * 계정 보호 조치 감지
 * @param {Object} page - Puppeteer 페이지 객체
 * @returns {Object} - { isProtected: boolean, accountId: string|null }
 */
async function detectAccountProtection(page) {
    try {
        console.log('🔍 계정 보호 조치 확인 중...');
        
        // 계정 보호 페이지 감지 (여러 선택자로 확인)
        const protectionSelectors = [
            '.warning_title h2', // 주요 경고 제목
            '.sp.ico_warning.ico_warning2', // 경고 아이콘
            'div.warning', // 경고 div
            '#divWarning', // 경고 div ID
            '.warning_title', // 경고 제목 영역
            'h2', // 모든 h2 태그 (내용으로 확인)
        ];
        
        let isProtected = false;
        let accountId = null;
        
        // 1. 경고 제목 확인
        for (const selector of protectionSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    const text = await page.evaluate(el => el.textContent, element);
                    if (text && (
                        text.includes('회원님의 아이디를 보호하고 있습니다') ||
                        text.includes('아이디를 보호하고 있습니다') ||
                        text.includes('보호조치') ||
                        text.includes('개인정보보호 및 도용')
                    )) {
                        console.log('⚠️ 계정 보호 조치 감지됨!');
                        console.log(`감지된 텍스트: ${text.substring(0, 100)}...`);
                        isProtected = true;
                        break;
                    }
                }
            } catch (e) {
                // 선택자 오류는 무시하고 다음 선택자 시도
            }
        }
        
        // 1-2. 전체 페이지 텍스트에서 보호 조치 확인
        if (!isProtected) {
            try {
                const pageText = await page.evaluate(() => document.body.textContent || document.body.innerText);
                if (pageText && (
                    pageText.includes('회원님의 아이디를 보호하고 있습니다') ||
                    pageText.includes('개인정보보호 및 도용으로 인한 피해를 예방하기 위해') ||
                    pageText.includes('보호조치 해제') ||
                    pageText.includes('아이디는 언제 보호되나요')
                )) {
                    console.log('⚠️ 페이지 텍스트에서 계정 보호 조치 감지됨!');
                    isProtected = true;
                }
            } catch (e) {
                console.log('페이지 텍스트 확인 중 오류:', e.message);
            }
        }
        
        // 2. 아이디 추출 (여러 방법으로 시도)
        if (isProtected) {
            try {
                // 2-1. em 태그에서 추출
                const accountElement = await page.$('.warning_title p em, em');
                if (accountElement) {
                    accountId = await page.evaluate(el => el.textContent, accountElement);
                    console.log(`🔒 보호된 계정 ID (em 태그): ${accountId}`);
                }
                
                // 2-2. 페이지 텍스트에서 정규식으로 추출
                if (!accountId) {
                    const pageText = await page.evaluate(() => document.body.textContent || document.body.innerText);
                    
                    // 여러 패턴으로 시도
                    const patterns = [
                        /아이디\(([^)]+)\)를 보호하고 있습니다/,
                        /아이디\(([^)]+)\)를/,
                        /아이디\s*\(\s*([^)]+)\s*\)/,
                        /개인정보보호.*아이디\(([^)]+)\)/,
                    ];
                    
                    for (const pattern of patterns) {
                        const match = pageText.match(pattern);
                        if (match && match[1]) {
                            accountId = match[1].trim();
                            console.log(`🔒 텍스트에서 추출된 계정 ID: ${accountId}`);
                            break;
                        }
                    }
                }
                
                // 2-3. 모든 em 태그에서 아이디 형식 찾기
                if (!accountId) {
                    const allEmElements = await page.$$('em');
                    for (const emEl of allEmElements) {
                        const text = await page.evaluate(el => el.textContent, emEl);
                        if (text && /^[a-zA-Z0-9_-]+$/.test(text) && text.length >= 4 && text.length <= 20) {
                            accountId = text;
                            console.log(`🔒 em 태그에서 발견된 계정 ID: ${accountId}`);
                            break;
                        }
                    }
                }
                
            } catch (e) {
                console.log('계정 ID 추출 중 오류:', e.message);
            }
        }
        
        // 3. URL에서도 확인 (보조 수단)
        if (!isProtected) {
            const currentUrl = page.url();
            if (currentUrl.includes('idSafetyRelease') || currentUrl.includes('help/idSafety')) {
                console.log('⚠️ URL에서 계정 보호 페이지 감지됨!');
                isProtected = true;
            }
        }
        
        return { isProtected, accountId };
        
    } catch (error) {
        console.error('계정 보호 조치 감지 중 오류:', error.message);
        return { isProtected: false, accountId: null };
    }
}

/**
 * 보호된 계정을 post_id.txt에서 제거하고 check_id.txt로 이동
 * @param {string} accountId - 보호된 계정 ID
 * @param {string} reason - 보호/정지 사유 (기본값: '보호조치')
 */
function moveProtectedAccount(accountId, reason = '보호조치') {
    try {
        console.log(`📝 보호된 계정 처리 시작: ${accountId}`);
        
        const settingsDir = path.join(__dirname, '..', 'settings');
        const postIdFile = path.join(settingsDir, 'post_id.txt');
        const checkIdFile = path.join(settingsDir, 'check_id.txt');
        
        // settings 폴더가 없으면 생성
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }
        
        let accountFound = false;
        let accountPassword = null;
        
        // 1. post_id.txt에서 해당 계정 찾기 및 제거
        if (fs.existsSync(postIdFile)) {
            const content = fs.readFileSync(postIdFile, 'utf-8');
            const lines = content.split('\n');
            const filteredLines = [];
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('#')) {
                    const parts = trimmedLine.split(':');
                    const id = parts[0] ? parts[0].trim() : '';
                    const password = parts[1] ? parts[1].trim() : '';
                    
                    if (id === accountId) {
                        accountFound = true;
                        accountPassword = password;
                        console.log(`✅ post_id.txt에서 계정 발견: ${id}`);
                    } else {
                        filteredLines.push(line); // 다른 계정은 유지
                    }
                } else {
                    filteredLines.push(line); // 주석이나 빈 줄은 유지
                }
            }
            
            if (accountFound) {
                // post_id.txt 업데이트 (보호된 계정 제거)
                fs.writeFileSync(postIdFile, filteredLines.join('\n'), 'utf-8');
                console.log(`✅ post_id.txt에서 ${accountId} 제거 완료`);
            }
        }
        
        // 2. check_id.txt에 보호된 계정 추가
        const currentDate = new Date().toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        let checkContent = '';
        if (fs.existsSync(checkIdFile)) {
            checkContent = fs.readFileSync(checkIdFile, 'utf-8');
        }
        
        // check_id.txt에 추가할 내용
        const newEntry = `${accountId}:${accountPassword || 'unknown'}:${reason}:${currentDate}\n`;
        
        // 중복 확인 (이미 있는지 체크)
        if (!checkContent.includes(`${accountId}:`)) {
            checkContent += newEntry;
            fs.writeFileSync(checkIdFile, checkContent, 'utf-8');
            console.log(`✅ check_id.txt에 ${accountId} 추가 완료`);
        } else {
            console.log(`⚠️ ${accountId}는 이미 check_id.txt에 존재합니다`);
        }
        
        // 3. 결과 요약
        console.log(`\n📋 계정 처리 완료:`);
        console.log(`   🔒 계정 ID: ${accountId}`);
        console.log(`   📝 사유: ${reason}`);
        console.log(`   📤 post_id.txt에서 제거: ${accountFound ? '성공' : '계정 없음'}`);
        console.log(`   📥 check_id.txt로 이동: 완료`);
        console.log(`   📅 처리 시간: ${currentDate}`);
        
        return { success: true, accountFound, movedToCheck: true };
        
    } catch (error) {
        console.error(`❌ 보호된 계정 처리 중 오류: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * 보호조치 해제 시도
 * @param {Object} page - Puppeteer 페이지 객체
 * @returns {Object} - 해제 시도 결과
 */
async function attemptProtectionRelease(page) {
    try {
        console.log('🔓 보호조치 해제 시도 중...');
        
        // 보호조치 해제 버튼 찾기
        const releaseSelectors = [
            'a.btn:contains("보호조치 해제")', // 텍스트 포함 링크
            '.btn_next.detect_clear a.btn', // 구체적인 클래스 경로
            'a[onclick*="mainSubmit"]', // mainSubmit 함수 호출 링크
            '.btn_next a', // 일반적인 다음 버튼
            'a:contains("해제")', // 해제 텍스트 포함
        ];
        
        let releaseAttempted = false;
        
        for (const selector of releaseSelectors) {
            try {
                // CSS 선택자는 :contains를 지원하지 않으므로 JavaScript로 처리
                const releaseButton = await page.evaluate((sel) => {
                    if (sel.includes(':contains(')) {
                        // 텍스트 기반 선택
                        const elements = document.querySelectorAll('a.btn, a');
                        for (const el of elements) {
                            if (el.textContent && el.textContent.includes('보호조치 해제')) {
                                return el;
                            }
                        }
                        return null;
                    } else {
                        // 일반 선택자
                        return document.querySelector(sel);
                    }
                }, selector);
                
                if (releaseButton) {
                    await page.evaluate((btn) => {
                        if (btn.onclick) {
                            btn.onclick(); // onclick 함수 실행
                        } else {
                            btn.click(); // 일반 클릭
                        }
                    }, releaseButton);
                    
                    console.log(`✅ 보호조치 해제 버튼 클릭 성공! (선택자: ${selector})`);
                    releaseAttempted = true;
                    break;
                }
            } catch (e) {
                // 다음 선택자 시도
            }
        }
        
        if (!releaseAttempted) {
            console.log('❌ 보호조치 해제 버튼을 찾을 수 없습니다.');
            return { attempted: false, success: false };
        }
        
        // 해제 시도 후 결과 확인
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 계정 정지/차단 확인
        const suspensionCheck = await page.evaluate(() => {
            const text = document.body.textContent || '';
            
            // 정지/차단 관련 키워드 검색
            const suspensionKeywords = [
                '정지된 계정', '차단된 계정', '임시정지', '영구정지',
                '계정이 정지', '계정이 차단', '이용이 정지', '이용이 차단',
                '서비스 이용이 제한', '계정 사용이 제한', '접근이 차단',
                '일시정지', '영구차단', '계정 잠금', '사용 중지'
            ];
            
            for (const keyword of suspensionKeywords) {
                if (text.includes(keyword)) {
                    return { isSuspended: true, reason: keyword };
                }
            }
            
            return { isSuspended: false };
        });
        
        if (suspensionCheck.isSuspended) {
            console.log(`🚫 계정 정지/차단 확인됨: ${suspensionCheck.reason}`);
            return { 
                attempted: true, 
                success: false, 
                isSuspended: true,
                suspensionReason: suspensionCheck.reason
            };
        }
        
        // 보호조치 페이지가 사라졌는지 확인
        const stillProtected = await detectAccountProtection(page);
        
        if (!stillProtected.isProtected) {
            console.log('🎉 보호조치 해제 성공!');
            return { attempted: true, success: true };
        } else {
            console.log('⚠️ 보호조치 해제 시도했으나 여전히 보호 상태입니다.');
            return { attempted: true, success: false };
        }
        
    } catch (error) {
        console.error('보호조치 해제 시도 중 오류:', error.message);
        return { attempted: true, success: false, error: error.message };
    }
}

/**
 * 계정 보호 조치 전체 처리 흐름
 * @param {Object} page - Puppeteer 페이지 객체
 * @returns {Object} - 처리 결과
 */
async function handleAccountProtection(page) {
    try {
        // 1. 계정 보호 조치 감지
        const detection = await detectAccountProtection(page);
        
        if (!detection.isProtected) {
            return { isProtected: false, handled: false };
        }
        
        console.log(`\n🚨 계정 보호 조치 발견!`);
        
        if (!detection.accountId) {
            console.error('❌ 보호된 계정 ID를 찾을 수 없습니다.');
            return { isProtected: true, handled: false, error: '계정 ID 추출 실패' };
        }
        
        // 2. 보호조치 해제 시도하지 않고 바로 계정 격리
        console.log('\n⚠️ 보호조치 계정을 바로 격리합니다 (해제 시도 안함).');
        
        const moveResult = moveProtectedAccount(detection.accountId, '보호조치');
        
        if (moveResult.success) {
            console.log(`\n✅ 계정 보호 조치 처리 완료: ${detection.accountId}`);
            return {
                isProtected: true,
                handled: true,
                accountId: detection.accountId,
                releaseAttempted: false,
                releaseSuccessful: false,
                moveResult
            };
        } else {
            console.error(`❌ 계정 이동 처리 실패: ${moveResult.error}`);
            return {
                isProtected: true,
                handled: false,
                accountId: detection.accountId,
                releaseAttempted: false,
                releaseSuccessful: false,
                error: moveResult.error
            };
        }
        
    } catch (error) {
        console.error('계정 보호 조치 처리 중 오류:', error.message);
        return { isProtected: false, handled: false, error: error.message };
    }
}

/**
 * check_id.txt 파일 내용 확인
 */
function viewProtectedAccounts() {
    try {
        const checkIdFile = path.join(__dirname, '..', 'settings', 'check_id.txt');
        
        if (!fs.existsSync(checkIdFile)) {
            console.log('📄 check_id.txt 파일이 없습니다.');
            return [];
        }
        
        const content = fs.readFileSync(checkIdFile, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        
        console.log(`\n📋 보호된 계정 목록 (총 ${lines.length}개):`);
        console.log('─'.repeat(60));
        
        const accounts = [];
        lines.forEach((line, index) => {
            const parts = line.split(':');
            if (parts.length >= 4) {
                const account = {
                    id: parts[0],
                    password: parts[1],
                    status: parts[2],
                    date: parts.slice(3).join(':')
                };
                accounts.push(account);
                console.log(`${index + 1}. ${account.id} | ${account.status} | ${account.date}`);
            }
        });
        
        console.log('─'.repeat(60));
        return accounts;
        
    } catch (error) {
        console.error('보호된 계정 목록 조회 중 오류:', error.message);
        return [];
    }
}

module.exports = {
    detectAccountProtection,
    moveProtectedAccount,
    handleAccountProtection,
    viewProtectedAccounts
};
