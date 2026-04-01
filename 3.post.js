const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const axios = require("axios");
require('dotenv').config();

// 모듈 임포트
const { uploadImage } = require('./lib/image-module');
const { uploadVideo } = require('./lib/video-module');
const { changeTextFormat } = require('./lib/text-format-module');
const { changeAlignment } = require('./lib/align-module');
const { changeFontSize } = require('./lib/font-size-module');
const { createSlideshow } = require('./lib/slideshow-module');
const { addOgLink } = require('./lib/oglink-module');
const { addQuotation } = require('./lib/quotation-module');
const { login, loadLoginData, getCookieFilePath } = require('./lib/login-module');
const { checkAndHandleBlogStatus, extractBlogId, updateBlogIdInCookies } = require('./lib/blog-status-module');
const { handleAccountProtection } = require('./lib/account-protection-module');

// 브라우저 종료 플래그 (writePost와 visitNaver 양쪽에서 접근 가능하도록 모듈 레벨에 선언)
let isShuttingDown = false;

// ========================================
// 🎯 설정 파일 선택 변수
// ========================================
const USE_ENV_FILE = process.env.POST_ID ? 1 : 0;  // 환경변수에 POST_ID가 있으면 자동으로 env 사용

// 로그인 확인 후 대기 시간 설정 (분 단위)
const LOGIN_WAIT_MINUTES = 0.0001;  // 로그인 확인 후 대기 시간 (분)

// 발행 완료 후 대기 시간 설정 (분 단위)
const POST_COMPLETION_WAIT_MINUTES = 0.00001;  // 발행 완료 후 3분 대기

// 타이핑 속도 설정 (1: 랜덤 속도, 0: 매우 빠른 속도)
const RANDOM_TYPING = 0;

// 동영상 생성 여부 (1: 동영상 생성 및 업로드, 0: 동영상 사용 안함)
const USE_VIDEO = 0;

// 발행 모드 설정 (auto: 자동계산, instant: 즉시발행, manual: 직접지정)
const SCHEDULE_MODE = process.env.SCHEDULE_MODE || 'instant';
const SCHEDULE_DATE = process.env.SCHEDULE_DATE || '';
const SCHEDULE_HOUR = process.env.SCHEDULE_HOUR || '';
const SCHEDULE_MINUTE = process.env.SCHEDULE_MINUTE || '';

// 카카오톡 상담 링크 (오픈채팅 URL 입력)
const KAKAO_LINK = process.env.KAKAO_LINK !== undefined ? process.env.KAKAO_LINK : '';

// 발행 간격 설정 (시간 단위, 예: 3.5 = 3시간 30분)
const RANDOM_DELAY_MIN = process.env.RANDOM_DELAY_MIN !== undefined ? Number(process.env.RANDOM_DELAY_MIN) : 3.5;  // 최소 3시간 30분
const RANDOM_DELAY_MAX = process.env.RANDOM_DELAY_MAX !== undefined ? Number(process.env.RANDOM_DELAY_MAX) : 5;    // 최대 5시간

// KST 시간 관련 헬퍼 함수들
function getKSTTime(date = null) {
    const now = date || new Date();
    const kstOffset = 9 * 60; // 한국시간은 UTC+9
    return new Date(now.getTime() + (now.getTimezoneOffset() + kstOffset) * 60000);
}

function createKSTDate(year, month, day, hour = 0, minute = 0, second = 0) {
    // 한국시간 기준으로 Date 객체 생성
    const kstTime = getKSTTime();
    kstTime.setFullYear(year);
    kstTime.setMonth(month - 1); // month는 0부터 시작
    kstTime.setDate(day);
    kstTime.setHours(hour, minute, second, 0);
    return kstTime;
}

// User-Agent 풀 (계정마다 랜덤 선택)
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// 설정 로드
const postSettings = loadPostSettings();
const POST_ID = postSettings.POST_ID;
const POST_PASSWORD = postSettings.POST_PASSWORD;
let BLOG_ID = null; // cookies JSON에서 가져올 예정

// 선택된 계정 읽기 함수
function getSelectedAccountFromDashboard() {
    if (USE_ENV_FILE === 1) {
        return null; // .env 사용 시에는 대시보드 관리 안함
    }

    console.log('\n📊 선택된 포스트 계정 확인...');

    try {
        const dashboardDir = path.join(process.env.USER_DATA_DIR || __dirname, 'post_dashboard');
        const selectedAccountFile = path.join(dashboardDir, 'selected_account.txt');

        if (!fs.existsSync(selectedAccountFile)) {
            throw new Error(`선택된 계정 파일이 없습니다: ${selectedAccountFile}. 먼저 1.crawl.js를 실행해주세요.`);
        }

        // 선택된 계정 정보 읽기 (계정ID | 블로그이름 형식)
        const accountInfo = fs.readFileSync(selectedAccountFile, 'utf-8').trim();

        if (!accountInfo) {
            throw new Error('선택된 계정 파일이 비어있습니다. 먼저 1.crawl.js를 실행해주세요.');
        }

        // 계정 ID와 블로그 이름 분리
        const parts = accountInfo.split(' | ');
        const selectedAccountId = parts[0];
        const blogName = parts[1] || '블로그이름없음';

        if (!selectedAccountId) {
            throw new Error('선택된 계정 정보가 올바르지 않습니다. 먼저 1.crawl.js를 실행해주세요.');
        }

        console.log(`✅ 선택된 계정 확인: ${selectedAccountId} | ${blogName}`);
        return selectedAccountId;

    } catch (error) {
        console.error('❌ 선택된 계정 확인 오류:', error.message);
        process.exit(1);
    }
}

// 설정 파일 읽기 함수
function loadPostSettings() {
    if (USE_ENV_FILE === 1) {
        console.log('📄 .env 파일을 사용합니다.');
        return {
            POST_ID: process.env.POST_ID,
            POST_PASSWORD: process.env.POST_PASSWORD,
            GEMINI_API_KEY: process.env.GEMINI_API_KEY
        };
    } else {
        console.log('📄 settings/post_id.txt 파일을 사용합니다.');

        // 대시보드에서 선택된 계정 가져오기
        const selectedAccountId = getSelectedAccountFromDashboard();

        try {
            const settingPath = path.join(__dirname, 'settings', 'post_id.txt');
            if (!fs.existsSync(settingPath)) {
                throw new Error('settings/post_id.txt 파일을 찾을 수 없습니다.');
            }

            const content = fs.readFileSync(settingPath, 'utf-8');
            let selectedAccount = null;

            // 선택된 계정의 비밀번호 찾기
            content.split('\n').forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('#') && trimmedLine.includes(':')) {
                    const parts = trimmedLine.split(':');
                    const id = parts[0];
                    const password = parts[1];
                    if (id && password && id.trim() === selectedAccountId) {
                        selectedAccount = {
                            id: id.trim(),
                            password: password.trim()
                        };
                    }
                }
            });

            if (!selectedAccount) {
                throw new Error(`선택된 계정 ${selectedAccountId}의 비밀번호를 찾을 수 없습니다.`);
            }

            console.log(`✅ 계정 정보 로드 완료: ${selectedAccount.id}`);

            return {
                POST_ID: selectedAccount.id,
                POST_PASSWORD: selectedAccount.password,
                SELECTED_ACCOUNT: selectedAccount.id
            };

        } catch (error) {
            console.error('❌ settings/post_id.txt 파일 읽기 오류:', error.message);
            console.log('💡 settings/post_id.txt 파일 형식:');
            console.log('account1:password1');
            console.log('account2:password2');
            console.log('account3:password3');
            process.exit(1);
        }
    }
}

// KST 시간 가져오기 함수
function getKSTDate() {
    const now = new Date();
    const kstOffset = 9 * 60; // KST는 UTC+9
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (kstOffset * 60000));
}


// 랜덤 파일명 생성 및 복사 함수
function createRandomImageCopy(originalImagePath) {
    try {
        // 랜덤 파일명 생성 (a-z 5-8글자 + 3-6자리 숫자)
        const randomLetters = generateRandomString(Math.floor(Math.random() * 4) + 5); // 5-8글자
        const randomNumbers = Math.floor(Math.random() * 999000) + 1000; // 1000-999999
        const randomFileName = `${randomLetters}${randomNumbers}.png`;

        // 임시 디렉토리에 복사
        const tempDir = os.tmpdir();
        const randomImagePath = path.join(tempDir, randomFileName);

        // 파일 복사
        fs.copyFileSync(originalImagePath, randomImagePath);

        console.log(`📁 랜덤 파일명으로 복사됨: ${randomFileName}`);
        return randomImagePath;

    } catch (error) {
        console.error('랜덤 이미지 복사 중 오류:', error.message);
        return originalImagePath; // 실패 시 원본 경로 반환
    }
}

// 랜덤 문자열 생성 함수 (a-z)
function generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 임시 복사본 파일 정리 함수
function cleanupRandomImageCopy(randomImagePath) {
    try {
        if (fs.existsSync(randomImagePath)) {
            fs.unlinkSync(randomImagePath);
            const fileName = path.basename(randomImagePath);
            console.log(`🗑️ 임시 파일 삭제 완료: ${fileName}`);
        }
    } catch (error) {
        console.error('임시 파일 삭제 중 오류:', error.message);
    }
}

// 임시 폴더 정리 함수
function cleanupTempDirectories() {
    try {
        console.log('\n🧹 임시 폴더 정리를 시작합니다...');

        const tempDir = os.tmpdir();
        const files = fs.readdirSync(tempDir);

        let deletedCount = 0;

        // naver-post-, naver-login-, puppeteer 관련 폴더들 찾기
        const tempPatterns = [
            /^naver-post-/,      // 3.post.js에서 생성한 폴더
            /^naver-login-/,     // login-module에서 생성한 폴더
            /^puppeteer_dev_chrome_profile-/,  // Puppeteer 기본 임시 폴더
            /^\.org\.chromium\.Chromium\./,    // Chrome 임시 폴더
            /^scoped_dir\d+_/,   // Chrome scoped 임시 폴더
            /^chrome_MEDIA_CACHE_/,  // Chrome 미디어 캐시
            /^Crashpad/,         // Chrome 크래시 리포트
            /^\.com\.google\.Chrome\./,  // Chrome 기타 임시 폴더
        ];

        files.forEach(file => {
            const isTargetFolder = tempPatterns.some(pattern => pattern.test(file));

            if (isTargetFolder) {
                const fullPath = path.join(tempDir, file);

                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                        console.log(`✅ 삭제됨: ${file}`);
                        deletedCount++;
                    }
                } catch (error) {
                    console.log(`⚠️ 삭제 실패: ${file} (${error.message})`);
                }
            }
        });

        // Chrome 사용자 데이터 캐시 정리 (Windows)
        if (os.platform() === 'win32') {
            const chromeUserDataPaths = [
                path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'ShaderCache'),
                path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'GrShaderCache'),
                path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'GraphiteDawnCache'),
            ];

            chromeUserDataPaths.forEach(cachePath => {
                if (fs.existsSync(cachePath)) {
                    try {
                        fs.rmSync(cachePath, { recursive: true, force: true });
                        console.log(`✅ Chrome 캐시 삭제됨: ${path.basename(cachePath)}`);
                        deletedCount++;
                    } catch (error) {
                        console.log(`⚠️ Chrome 캐시 삭제 실패: ${path.basename(cachePath)} (${error.message})`);
                    }
                }
            });
        }

        console.log(`🎉 임시 폴더 및 캐시 정리 완료: ${deletedCount}개 항목 삭제\n`);

    } catch (error) {
        console.error('임시 폴더 정리 중 오류:', error.message);
    }
}

// 발행 기록 파일 관리 함수들
function getPostedFileName(userId) {
    return `${userId}_posted.txt`;
}

// 파일 내 오래된 발행 기록 삭제 함수
function cleanupOldRecordsInFile(userId) {
    const fileName = getPostedFileName(userId);
    const postedDir = path.join(process.env.USER_DATA_DIR || __dirname, 'posted');
    const filePath = path.join(postedDir, fileName);

    if (!fs.existsSync(filePath)) {
        return;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        const currentDate = getKSTTime();
        const validRecords = [];
        let deletedCount = 0;

        lines.forEach(line => {
            // 새 형식: 1회:2025-08-31:13:30분 또는 1회:2025-08-31:13:30분:URL
            const newMatch = line.match(/(\d+)회:(\d{4}-\d{2}-\d{2}):(\d{2}):(\d{2})분(?::(.+))?/);
            if (newMatch) {
                const recordDate = new Date(newMatch[2] + 'T00:00:00+09:00'); // KST 기준
                const daysDiff = Math.floor((currentDate - recordDate) / (1000 * 60 * 60 * 24));

                if (daysDiff < 3) {
                    validRecords.push(line);
                } else {
                    deletedCount++;
                    console.log(`3일 이상 된 기록 삭제: ${line} (${daysDiff}일 전)`);
                }
            } else {
                // 기존 형식이나 기타 형식은 유지
                validRecords.push(line);
            }
        });

        if (deletedCount > 0) {
            // 유효한 기록만 다시 저장
            fs.writeFileSync(filePath, validRecords.join('\n') + (validRecords.length > 0 ? '\n' : ''), 'utf-8');
            console.log(`파일 내에서 ${deletedCount}개의 오래된 기록이 삭제되었습니다.`);
        }

    } catch (error) {
        console.error('파일 내 기록 정리 중 오류:', error.message);
    }
}

function loadPostedRecords(userId) {
    const fileName = getPostedFileName(userId);
    const postedDir = path.join(process.env.USER_DATA_DIR || __dirname, 'posted');

    // posted 폴더가 없으면 생성
    if (!fs.existsSync(postedDir)) {
        fs.mkdirSync(postedDir, { recursive: true });
    }

    const filePath = path.join(postedDir, fileName);

    if (!fs.existsSync(filePath)) {
        return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    const records = lines.map(line => {
        // 새 형식: 1회:2025-08-31:13:30분 또는 1회:2025-08-31:13:30분:URL
        const newMatch = line.match(/(\d+)회:(\d{4}-\d{2}-\d{2}):(\d{2}):(\d{2})분(?::(.+))?/);
        if (newMatch) {
            return {
                count: parseInt(newMatch[1]),
                date: newMatch[2],
                hour: parseInt(newMatch[3]),
                minute: parseInt(newMatch[4]),
                url: newMatch[5] || ''
            };
        }

        // 기존 형식: 1회:13:30분 (호환성 유지)
        const oldMatch = line.match(/(\d+)회:(\d{2}):(\d{2})분/);
        if (oldMatch) {
            // 기존 형식은 현재 KST 날짜로 가정
            const kstDate = getKSTTime();
            const year = kstDate.getFullYear();
            const month = String(kstDate.getMonth() + 1).padStart(2, '0');
            const day = String(kstDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            return {
                count: parseInt(oldMatch[1]),
                date: dateStr,
                hour: parseInt(oldMatch[2]),
                minute: parseInt(oldMatch[3])
            };
        }
        return null;
    }).filter(Boolean);

    // 시간순으로 정렬 (최신순), 시간이 같으면 회차 번호로 정렬
    records.sort((a, b) => {
        const timeA = new Date(`${a.date}T${String(a.hour).padStart(2, '0')}:${String(a.minute).padStart(2, '0')}:00+09:00`);
        const timeB = new Date(`${b.date}T${String(b.hour).padStart(2, '0')}:${String(b.minute).padStart(2, '0')}:00+09:00`);

        // 시간이 다르면 시간 기준으로 정렬
        if (timeB.getTime() !== timeA.getTime()) {
            return timeB - timeA; // 내림차순 정렬 (최신이 먼저)
        }

        // 시간이 같으면 회차 번호로 정렬 (높은 회차가 최신)
        return b.count - a.count;
    });

    return records;
}

function savePostedRecord(userId, hour, minute, scheduledDate = null, url = '') {
    const fileName = getPostedFileName(userId);
    const postedDir = path.join(process.env.USER_DATA_DIR || __dirname, 'posted');

    // posted 폴더가 없으면 생성
    if (!fs.existsSync(postedDir)) {
        fs.mkdirSync(postedDir, { recursive: true });
    }

    const filePath = path.join(postedDir, fileName);

    const records = loadPostedRecords(userId);

    // 예약 날짜가 제공되면 사용, 아니면 현재 KST 날짜 사용
    let dateStr;
    if (scheduledDate) {
        dateStr = scheduledDate;
    } else {
        const kstDate = getKSTTime();
        const year = kstDate.getFullYear();
        const month = String(kstDate.getMonth() + 1).padStart(2, '0');
        const day = String(kstDate.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
    }

    // 중복 저장 방지: 같은 날짜와 시간이 이미 존재하는지 확인
    const isDuplicate = records.some(record =>
        record.date === dateStr &&
        record.hour === hour &&
        record.minute === minute
    );

    if (isDuplicate) {
        console.log(`⚠️ 중복된 발행 기록이 이미 존재합니다: ${dateStr} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
        return { count: records.length, date: dateStr, hour, minute };
    }

    const count = records.length + 1;
    const urlSuffix = url ? `:${url}` : '';
    const newRecord = `${count}회:${dateStr}:${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}분${urlSuffix}\n`;

    fs.appendFileSync(filePath, newRecord, 'utf-8');
    console.log(`발행 기록 저장: ${newRecord.trim()}`);

    return { count, date: dateStr, hour, minute };
}

function calculateNextPostTime(records) {
    if (records.length === 0) {
        return null;
    }

    const lastRecord = records[0];
    const lastTime = createKSTDate(
        parseInt(lastRecord.date.split('-')[0]),
        parseInt(lastRecord.date.split('-')[1]),
        parseInt(lastRecord.date.split('-')[2]),
        lastRecord.hour,
        lastRecord.minute
    );

    const minMinutes = Math.floor(RANDOM_DELAY_MIN * 60);
    const maxMinutes = Math.floor(RANDOM_DELAY_MAX * 60);
    const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;

    // 현재 KST 시간
    const nowKST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));

    // 마지막 발행 시간 + 랜덤 시간
    let nextTime = new Date(lastTime.getTime() + randomMinutes * 60000);

    // 계산된 시간이 현재보다 과거면, 현재 시간 기준으로 재계산
    if (nextTime <= nowKST) {
        console.log(`⚠️ 계산된 시간이 과거임 → 현재 시간 기준으로 재계산`);
        nextTime = new Date(nowKST.getTime() + randomMinutes * 60000);
    }

    console.log(`📅 예약 시간: ${nextTime.getHours()}:${String(Math.floor(nextTime.getMinutes() / 10) * 10).padStart(2, '0')} (+${Math.floor(randomMinutes / 60)}시간 ${randomMinutes % 60}분)`);

    return {
        hour: nextTime.getHours(),
        minute: Math.floor(nextTime.getMinutes() / 10) * 10,
        scheduledTime: nextTime
    };
}



// 파일 전송 오류 팝업 처리 함수
async function handleFileTransferError(page, frame) {
    try {
        console.log('파일 전송 오류 팝업 확인 중...');

        let errorFound = false;
        let popupHandled = false;

        // 1. iframe 내부에서 팝업 확인
        try {
            const framePopupExists = await frame.$('.se-popup-container.__se-pop-layer');
            if (framePopupExists) {
                const titleElement = await frame.$('.se-popup-title');
                if (titleElement) {
                    const titleText = await frame.evaluate(el => el.textContent, titleElement);
                    if (titleText && titleText.includes('파일 전송 오류')) {
                        console.log('iframe 내부에서 파일 전송 오류 팝업 발견!');
                        errorFound = true;

                        // 확인 버튼 클릭
                        const confirmBtn = await frame.$('.se-popup-button-confirm');
                        if (confirmBtn) {
                            await confirmBtn.click();
                            console.log('✅ iframe 내부에서 확인 버튼 클릭 완료');
                            popupHandled = true;
                            await new Promise((resolve) => setTimeout(resolve, 1000));
                        }
                    }
                }
            }
        } catch (frameError) {
            // iframe 내부 확인 실패는 무시하고 메인 페이지 확인
        }

        // 2. 메인 페이지에서 팝업 확인 (iframe에서 찾지 못한 경우)
        if (!errorFound) {
            try {
                const pagePopupExists = await page.$('.se-popup-container.__se-pop-layer');
                if (pagePopupExists) {
                    const titleElement = await page.$('.se-popup-title');
                    if (titleElement) {
                        const titleText = await page.evaluate(el => el.textContent, titleElement);
                        if (titleText && titleText.includes('파일 전송 오류')) {
                            console.log('메인 페이지에서 파일 전송 오류 팝업 발견!');
                            errorFound = true;

                            // 확인 버튼 클릭
                            const confirmBtn = await page.$('.se-popup-button-confirm');
                            if (confirmBtn) {
                                await confirmBtn.click();
                                console.log('✅ 메인 페이지에서 확인 버튼 클릭 완료');
                                popupHandled = true;
                                await new Promise((resolve) => setTimeout(resolve, 1000));
                            }
                        }
                    }
                }
            } catch (pageError) {
                // 메인 페이지 확인 실패
            }
        }

        // 3. 일반적인 팝업 텍스트로도 확인
        if (!errorFound) {
            try {
                // iframe 내부에서 텍스트로 확인
                const frameTextExists = await frame.evaluate(() => {
                    const alertText = document.querySelector('.se-popup-alert-text');
                    return alertText && alertText.textContent.includes('일시적으로 파일전송을 사용할 수 없습니다');
                });

                if (frameTextExists) {
                    console.log('iframe 내부에서 파일전송 오류 텍스트 발견!');
                    errorFound = true;
                    const confirmBtn = await frame.$('.se-popup-button-confirm');
                    if (confirmBtn) {
                        await confirmBtn.click();
                        console.log('✅ iframe 내부에서 텍스트 기반 확인 버튼 클릭 완료');
                        popupHandled = true;
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                    }
                }

                // 메인 페이지에서 텍스트로 확인
                if (!errorFound) {
                    const pageTextExists = await page.evaluate(() => {
                        const alertText = document.querySelector('.se-popup-alert-text');
                        return alertText && alertText.textContent.includes('일시적으로 파일전송을 사용할 수 없습니다');
                    });

                    if (pageTextExists) {
                        console.log('메인 페이지에서 파일전송 오류 텍스트 발견!');
                        errorFound = true;
                        const confirmBtn = await page.$('.se-popup-button-confirm');
                        if (confirmBtn) {
                            await confirmBtn.click();
                            console.log('✅ 메인 페이지에서 텍스트 기반 확인 버튼 클릭 완료');
                            popupHandled = true;
                            await new Promise((resolve) => setTimeout(resolve, 1000));
                        }
                    }
                }
            } catch (textError) {
                // 텍스트 기반 확인 실패
            }
        }

        if (errorFound && !popupHandled) {
            // 오류는 발견했지만 처리하지 못한 경우, ESC 키로 시도
            console.log('확인 버튼을 찾을 수 없어 ESC 키로 팝업 닫기 시도...');
            await page.keyboard.press('Escape');
            await new Promise((resolve) => setTimeout(resolve, 500));
            popupHandled = true;
        }

        return errorFound; // 오류가 발견되었으면 true, 아니면 false 반환

    } catch (error) {
        console.log('파일 전송 오류 팝업 확인 중 오류:', error.message);
        return false;
    }
}

// Chrome 실행 파일 경로 찾기 함수
function findChromePath() {
    const platform = os.platform();
    let chromePaths = [];

    if (platform === 'win32') {
        // Windows Chrome 경로들
        chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
            'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
        ];
    } else if (platform === 'darwin') {
        // macOS Chrome 경로들
        chromePaths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            path.join(os.homedir(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
        ];
    } else {
        // Linux Chrome 경로들
        chromePaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium'
        ];
    }

    // 존재하는 첫 번째 경로 반환
    for (const chromePath of chromePaths) {
        if (fs.existsSync(chromePath)) {
            console.log(`Chrome 경로를 찾았습니다: ${chromePath}`);
            return chromePath;
        }
    }

    console.log('Chrome을 찾을 수 없습니다. 기본 설정을 사용합니다.');
    return null;
}

// 빠른 타이핑을 위한 함수
async function typeWithRandomDelay(page, text, frame = null) {
    // 여러 형태의 백슬래시와 줄바꿈 텍스트를 실제 줄바꿈으로 처리
    text = text.replace(/\\backslash\s*n/g, '\n')   // \backslash n 패턴 (공백 있거나 없거나)
        .replace(/\(backslash\s*n\)/g, '\n')       // (backslash n) 텍스트
        .replace(/\\+n/g, '\n')                    // \n, \\n, \\\n 등 모든 백슬래시+n
        .replace(/\\\s+n/g, '\n')                  // 백슬래시+공백+n
        .replace(/\\backslash/g, '')               // 남은 \backslash 제거
        .replace(/\(backslash\)/g, '')             // 남은 (backslash) 제거
        .replace(/\\/g, '')                        // 모든 단일 백슬래시 제거
        .replace(/\n\s+/g, '\n')                   // 줄바꿈 후 공백 제거
        .trim();                                   // 앞뒤 공백 제거

    // \n을 엔터로 처리하기 위해 줄 단위로 분리
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (RANDOM_TYPING === 1) {
            // 랜덤 속도로 타이핑
            for (const char of line) {
                await page.keyboard.type(char, { delay: 30 + Math.random() * 40 }); // 30-70ms 랜덤
            }
        } else {
            // 매우 빠른 속도로 타이핑 - 복사-붙여넣기 방식
            if (frame) {
                // iframe 내부에서 실행
                await frame.evaluate((text) => {
                    const activeElement = document.activeElement;
                    if (activeElement) {
                        // 직접 텍스트 입력
                        const event = new InputEvent('input', { bubbles: true });
                        activeElement.textContent += text;
                        activeElement.dispatchEvent(event);
                    }
                }, line);
            } else {
                // 일반 페이지에서는 기존 방식
                await page.keyboard.type(line, { delay: 0 }); // 딜레이 0으로 최대한 빠르게
            }
        }

        // 마지막 줄이 아니면 엔터 키 입력
        if (i < lines.length - 1) {
            await page.keyboard.press('Enter');
            await new Promise((resolve) => setTimeout(resolve, 20)); // 엔터 후 매우 짧은 대기
        }
    }
}

// 블로그 글쓰기 함수
async function writePost(page, browser) {
    try {
        console.log("글쓰기 작업을 시작합니다...");

        // result.json 읽기
        let resultData;
        try {
            resultData = JSON.parse(fs.readFileSync('result.json', 'utf-8'));
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error('result.json 파일이 없습니다. 글 생성을 먼저 실행해주세요.');
                return;
            } else {
                console.error('result.json 파일 읽기 오류:', error.message);
                return;
            }
        }

        // gemini 데이터 확인
        if (!resultData.gemini) {
            console.error('result.json에 글 데이터가 없습니다. 글 생성을 먼저 실행해주세요.');
            return;
        }
        // sections가 비어있으면 h1/h3으로 기본 섹션 생성
        if (!resultData.gemini.sections || resultData.gemini.sections.length === 0) {
            console.log('⚠️ sections가 비어있습니다. 기본 섹션을 자동 생성합니다.');
            resultData.gemini.sections = [{
                h2: resultData.gemini.h1 || resultData.gemini.키워드 || '본문',
                p: resultData.gemini.h3 || ''
            }];
        }

        // iframe이 로드될 때까지 대기
        await page.waitForSelector('#mainFrame', { timeout: 10000 });

        // iframe으로 전환
        const frameHandle = await page.$('#mainFrame');
        const frame = await frameHandle.contentFrame();

        if (!frame) {
            console.error("iframe을 찾을 수 없습니다.");
            return;
        }

        console.log("iframe에 접근했습니다.");

        // 1. 먼저 작성 중인 글 팝업 확인 및 처리 (2번 체크)
        try {
            console.log("작성 중인 글 팝업 확인 중...");
            await new Promise((resolve) => setTimeout(resolve, 1000));

            let popupClosed = false;
            const maxAttempts = 2; // 최대 2번 시도

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                console.log(`팝업 확인 시도 ${attempt}/${maxAttempts}...`);

                const popupExists = await frame.$('.se-popup-container.__se-pop-layer');
                if (popupExists) {
                    console.log(`작성 중인 글 팝업을 발견했습니다. 취소 버튼을 클릭합니다... (${attempt}번째 시도)`);

                    try {
                        await frame.click('.se-popup-button-cancel');
                        console.log("취소 버튼 클릭 완료. 팝업이 닫히기를 기다립니다...");
                        await new Promise((resolve) => setTimeout(resolve, 3000));

                        // 팝업이 실제로 닫혔는지 재확인
                        const popupStillExists = await frame.$('.se-popup-container.__se-pop-layer');
                        if (!popupStillExists) {
                            console.log(`✅ 팝업이 성공적으로 닫혔습니다 (${attempt}번째 시도)`);
                            popupClosed = true;
                            break;
                        } else {
                            console.log(`❌ 팝업이 아직 남아있습니다 (${attempt}번째 시도)`);
                            if (attempt < maxAttempts) {
                                console.log("2초 후 다시 시도합니다...");
                                await new Promise((resolve) => setTimeout(resolve, 2000));
                            }
                        }
                    } catch (clickError) {
                        console.log(`팝업 클릭 실패 (${attempt}번째 시도):`, clickError.message);
                        if (attempt < maxAttempts) {
                            await new Promise((resolve) => setTimeout(resolve, 2000));
                        }
                    }
                } else {
                    console.log(`작성 중인 글 팝업이 없습니다 (${attempt}번째 시도)`);
                    popupClosed = true;
                    break;
                }
            }

            if (!popupClosed) {
                console.log("⚠️ 팝업을 닫는데 실패했지만 계속 진행합니다...");
            }

        } catch (popupError) {
            console.log("작성 중인 글 팝업 처리 중 오류:", popupError.message);
        }

        // 2. 작성 중인 글 팝업 처리 완료 후 도움말 팝업 처리
        try {
            console.log("도움말 팝업 확인을 시작합니다...");
            await new Promise((resolve) => setTimeout(resolve, 1000));
            let popupClosed = false;

            // 2-1. iframe 내부에서 도움말 팝업 확인 및 닫기 시도
            console.log("iframe 내부에서 도움말 팝업 확인 중...");
            const helpTitleInFrame = await frame.$('h1.se-help-title');
            if (helpTitleInFrame) {
                console.log("iframe 내부에서 도움말 팝업 발견!");

                const selectors = [
                    'button.se-help-panel-close-button',
                    '.se-help-panel-close-button',
                    'button[type="button"].se-help-panel-close-button',
                    '.se-help-header button[type="button"]',
                    '.se-help-header button',
                    'button:has(.se-blind:contains("닫기"))'
                ];

                for (const selector of selectors) {
                    try {
                        const btn = await frame.$(selector);
                        if (btn) {
                            await btn.click();
                            console.log(`✅ iframe 내부에서 닫기 성공! (선택자: ${selector})`);
                            popupClosed = true;
                            break;
                        }
                    } catch (e) {
                        console.log(`iframe 내부 ${selector} 시도 실패`);
                    }
                }

                // JavaScript로 직접 클릭 시도
                if (!popupClosed) {
                    try {
                        await frame.evaluate(() => {
                            const closeBtn = document.querySelector('button.se-help-panel-close-button');
                            if (closeBtn) {
                                closeBtn.click();
                                return true;
                            }
                            return false;
                        });
                        console.log("✅ iframe 내부에서 JavaScript로 닫기 성공!");
                        popupClosed = true;
                    } catch (e) {
                        console.log("iframe 내부 JavaScript 클릭 실패");
                    }
                }
            }

            // 2-2. iframe 밖(메인 페이지)에서 도움말 팝업 확인 및 닫기 시도
            if (!popupClosed) {
                console.log("메인 페이지에서 도움말 팝업 확인 중...");
                const helpTitleInPage = await page.$('h1.se-help-title');
                if (helpTitleInPage) {
                    console.log("메인 페이지에서 도움말 팝업 발견!");

                    const selectors = [
                        'button.se-help-panel-close-button',
                        '.se-help-panel-close-button',
                        'button[type="button"].se-help-panel-close-button',
                        '.se-help-header button[type="button"]',
                        '.se-help-header button',
                        'button:has(.se-blind)'
                    ];

                    for (const selector of selectors) {
                        try {
                            const btn = await page.$(selector);
                            if (btn) {
                                await btn.click();
                                console.log(`✅ 메인 페이지에서 닫기 성공! (선택자: ${selector})`);
                                popupClosed = true;
                                break;
                            }
                        } catch (e) {
                            console.log(`메인 페이지 ${selector} 시도 실패`);
                        }
                    }

                    // JavaScript로 직접 클릭 시도
                    if (!popupClosed) {
                        try {
                            const result = await page.evaluate(() => {
                                const closeBtn = document.querySelector('button.se-help-panel-close-button');
                                if (closeBtn) {
                                    closeBtn.click();
                                    return true;
                                }
                                // 모든 버튼을 찾아서 닫기 텍스트가 있는 버튼 클릭
                                const allButtons = document.querySelectorAll('button');
                                for (const btn of allButtons) {
                                    if (btn.innerText === '닫기' || btn.innerHTML.includes('닫기')) {
                                        btn.click();
                                        return true;
                                    }
                                }
                                return false;
                            });
                            if (result) {
                                console.log("✅ 메인 페이지에서 JavaScript로 닫기 성공!");
                                popupClosed = true;
                            }
                        } catch (e) {
                            console.log("메인 페이지 JavaScript 클릭 실패");
                        }
                    }
                }
            }

            // 2-3. ESC 키로 닫기 시도
            if (!popupClosed) {
                console.log("ESC 키로 닫기 시도...");
                await page.keyboard.press('Escape');
                await new Promise((resolve) => setTimeout(resolve, 500));

                // 팝업이 닫혔는지 확인
                const stillExists = await frame.$('h1.se-help-title') || await page.$('h1.se-help-title');
                if (!stillExists) {
                    console.log("✅ ESC 키로 닫기 성공!");
                    popupClosed = true;
                }
            }

            if (popupClosed) {
                console.log("도움말 팝업을 성공적으로 닫았습니다!");
                await new Promise((resolve) => setTimeout(resolve, 500));
            } else {
                console.log("도움말 팝업을 닫을 수 없었지만 계속 진행합니다.");
            }

        } catch (helpError) {
            console.log("도움말 팝업 처리 중 오류:", helpError.message);
            // 오류가 있어도 계속 진행
        }

        // 3. 링크 도움말 팝업 처리 (메인 도움말 닫은 후 나타날 수 있음)
        try {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            console.log("링크 도움말 팝업 확인을 시작합니다...");

            let linkHelpClosed = false;

            // 3-1. iframe 내부에서 링크 도움말 확인
            const linkHelpTitleInFrame = await frame.$('h1.se-help-layer-title');
            if (linkHelpTitleInFrame) {
                const titleText = await frame.evaluate(el => el.textContent, linkHelpTitleInFrame);
                if (titleText && titleText.includes('링크')) {
                    console.log("iframe 내부에서 링크 도움말 팝업 발견!");

                    const closeSelectors = [
                        'button.se-help-layer-button-close',
                        '.se-help-layer-button-close',
                        '.se-help-layer-header button[type="button"]:last-child',
                        'button:has(.se-blind:contains("닫기"))'
                    ];

                    for (const selector of closeSelectors) {
                        try {
                            const closeBtn = await frame.$(selector);
                            if (closeBtn) {
                                await closeBtn.click();
                                console.log(`✅ 링크 도움말 팝업 닫기 성공! (iframe, 선택자: ${selector})`);
                                linkHelpClosed = true;
                                break;
                            }
                        } catch (e) {
                            // 다음 선택자 시도
                        }
                    }
                }
            }

            // 3-2. 메인 페이지에서 링크 도움말 확인
            if (!linkHelpClosed) {
                const linkHelpTitleInPage = await page.$('h1.se-help-layer-title');
                if (linkHelpTitleInPage) {
                    const titleText = await page.evaluate(el => el.textContent, linkHelpTitleInPage);
                    if (titleText && titleText.includes('링크')) {
                        console.log("메인 페이지에서 링크 도움말 팝업 발견!");

                        const closeSelectors = [
                            'button.se-help-layer-button-close',
                            '.se-help-layer-button-close',
                            '.se-help-layer-header button[type="button"]:last-child',
                            'button:has(.se-blind:contains("닫기"))'
                        ];

                        for (const selector of closeSelectors) {
                            try {
                                const closeBtn = await page.$(selector);
                                if (closeBtn) {
                                    await closeBtn.click();
                                    console.log(`✅ 링크 도움말 팝업 닫기 성공! (page, 선택자: ${selector})`);
                                    linkHelpClosed = true;
                                    break;
                                }
                            } catch (e) {
                                // 다음 선택자 시도
                            }
                        }
                    }
                }
            }

            if (linkHelpClosed) {
                console.log("링크 도움말 팝업을 닫았습니다.");
                await new Promise((resolve) => setTimeout(resolve, 500));
            }

        } catch (linkHelpError) {
            console.log("링크 도움말 처리 중 오류:", linkHelpError.message);
            // 오류가 있어도 계속 진행
        }

        // 이미 위에서 작성 중인 글 팝업과 도움말 팝업을 순차적으로 처리했으므로 여기서는 제거

        // 제목 입력 (h1) - 빈 문자열이면 첫 번째 섹션 h2를 대체 사용, 콜론(:) 제거
        const rawTitle = resultData.gemini.h1 || (resultData.gemini.sections[0] && resultData.gemini.sections[0].h2) || '제목 없음';
        const cleanTitle = rawTitle.replace(/:/g, '');
        console.log(`제목 입력: ${cleanTitle}`);
        await frame.waitForSelector('.se-title-text', { timeout: 10000 });
        await frame.click('.se-title-text');
        await new Promise((resolve) => setTimeout(resolve, 100));
        await typeWithRandomDelay(page, cleanTitle);

        // 본문으로 이동
        console.log("본문 작성을 시작합니다...");
        await new Promise((resolve) => setTimeout(resolve, 200));

        // 본문 클릭
        await frame.waitForSelector('.se-section-text', { timeout: 10000 });
        await frame.click('.se-section-text');
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 엔터 두 번
        await new Promise((resolve) => setTimeout(resolve, 500));
        await page.keyboard.press('Enter');
        await new Promise((resolve) => setTimeout(resolve, 100));
        await page.keyboard.press('Enter');
        await new Promise((resolve) => setTimeout(resolve, 500));

        // h3 인사말 입력 (gemini에 h3가 있는 경우)
        if (resultData.gemini.h3) {
            console.log(`인사말 입력: ${resultData.gemini.h3}`);
            // 인사말 글자 크기 16으로 설정
            await changeFontSize(page, frame, '16');
            await new Promise((resolve) => setTimeout(resolve, 300));
            await typeWithRandomDelay(page, resultData.gemini.h3);

            // 글자 크기 기본값(15)으로 복원
            await new Promise((resolve) => setTimeout(resolve, 200));
            await page.keyboard.press('Enter');
            await new Promise((resolve) => setTimeout(resolve, 100));
            await changeFontSize(page, frame, '15');
            await new Promise((resolve) => setTimeout(resolve, 200));

            // 엔터로 단락 구분
            await page.keyboard.press('Enter');
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // 이미지 파일 목록 로드
        const imgsDir = path.join(__dirname, 'imgs');
        let allImageFiles = [];
        if (fs.existsSync(imgsDir)) {
            allImageFiles = fs.readdirSync(imgsDir)
                .filter(file => file.startsWith('product_') && (file.endsWith('.jpg') || file.endsWith('.png')))
                .sort((a, b) => {
                    const numA = parseInt(a.match(/product_(\d+)/)?.[1] || 0);
                    const numB = parseInt(b.match(/product_(\d+)/)?.[1] || 0);
                    return numA - numB;
                });
        }

        // 이미지를 섹션에 고르게 분배 계산
        // 예: 이미지 7장, 섹션 5개 → [2, 1, 2, 1, 1] 또는 [1, 2, 1, 2, 1]
        const sectionCount = resultData.gemini.sections.length;
        const imageAssignment = []; // imageAssignment[i] = 섹션 i에 들어갈 이미지 인덱스 배열
        for (let i = 0; i < sectionCount; i++) imageAssignment.push([]);

        if (allImageFiles.length > 0 && sectionCount > 0) {
            for (let imgIdx = 0; imgIdx < allImageFiles.length; imgIdx++) {
                // 이미지를 섹션에 균등 분배 (라운드로빈)
                const sectionIdx = Math.floor(imgIdx * sectionCount / allImageFiles.length);
                imageAssignment[Math.min(sectionIdx, sectionCount - 1)].push(imgIdx);
            }
            console.log(`이미지 ${allImageFiles.length}장을 섹션 ${sectionCount}개에 분배: ${imageAssignment.map((a, i) => `섹션${i + 1}=${a.length}장`).join(', ')}`);
        }

        // 이미지 업로드 헬퍼 함수
        async function uploadImageWithRetry(page, frame, imagePath) {
            let uploadSuccess = false;
            let retryCount = 0;
            const maxRetries = 3;
            while (!uploadSuccess && retryCount < maxRetries) {
                try {
                    await uploadImage(page, frame, imagePath);
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    const errorHandled = await handleFileTransferError(page, frame);
                    if (!errorHandled) {
                        uploadSuccess = true;
                    } else {
                        retryCount++;
                        console.log(`⚠️ 파일 전송 오류, 재시도 ${retryCount}/${maxRetries}`);
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                    }
                } catch (error) {
                    retryCount++;
                    console.log(`⚠️ 이미지 업로드 오류 (${retryCount}/${maxRetries}): ${error.message}`);
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
            }
            return uploadSuccess;
        }

        // 본문 텍스트를 네이버 SEO 스타일 단락으로 분리하는 함수
        // 2~3문장씩 끊어서 빈 줄로 구분 (가독성 극대화)
        function splitIntoParagraphs(text) {
            if (!text) return [];
            // 먼저 기존 줄바꿈으로 분리
            const rawLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const paragraphs = [];

            for (const line of rawLines) {
                // 문장 단위로 분리 (마침표, 물음표, 느낌표 + 공백 기준)
                const sentences = line.match(/[^.!?…]+[.!?…]+/g) || [line];
                let chunk = '';
                let sentCount = 0;

                for (const sentence of sentences) {
                    chunk += (chunk ? ' ' : '') + sentence.trim();
                    sentCount++;
                    // 2~3문장마다 단락 분리
                    if (sentCount >= 2 && (sentCount >= 3 || chunk.length > 80)) {
                        paragraphs.push(chunk.trim());
                        chunk = '';
                        sentCount = 0;
                    }
                }
                if (chunk.trim()) {
                    paragraphs.push(chunk.trim());
                }
            }
            return paragraphs;
        }

        // 각 섹션 처리
        for (let i = 0; i < sectionCount; i++) {
            const section = resultData.gemini.sections[i];

            // 인용구 5 (box) 사용
            await addQuotation(page, frame, 'd');
            await new Promise((resolve) => setTimeout(resolve, 100));

            // h2 텍스트 입력 (인용구 안에)
            await typeWithRandomDelay(page, section.h2);

            // 인용구 밖으로 나가기 - 아래 화살표 두 번
            await new Promise((resolve) => setTimeout(resolve, 500));
            await page.keyboard.press('ArrowDown');
            await new Promise((resolve) => setTimeout(resolve, 200));
            await page.keyboard.press('ArrowDown');
            await new Promise((resolve) => setTimeout(resolve, 500));

            // 엔터 키 누르기
            await page.keyboard.press('Enter');
            await new Promise((resolve) => setTimeout(resolve, 500));

            // 본문을 2~3문장 단락으로 분리
            const paragraphs = splitIntoParagraphs(section.p);
            const assignedImages = imageAssignment[i] || [];

            // 이미지를 단락 사이에 균등 배치할 위치 계산
            // 예: 단락 4개 + 이미지 2장 → 단락2 뒤, 단락4 뒤에 이미지 삽입
            const imagePositions = {}; // { 단락인덱스: [이미지인덱스들] }
            if (assignedImages.length > 0 && paragraphs.length > 0) {
                for (let imgJ = 0; imgJ < assignedImages.length; imgJ++) {
                    // 단락 사이에 균등 분배 (첫 단락 뒤부터)
                    const pos = Math.min(
                        Math.floor((imgJ + 1) * paragraphs.length / (assignedImages.length + 1)),
                        paragraphs.length - 1
                    );
                    if (!imagePositions[pos]) imagePositions[pos] = [];
                    imagePositions[pos].push(assignedImages[imgJ]);
                }
            }

            // 본문 글자 크기 설정 (16px - 가독성)
            await changeFontSize(page, frame, '16');
            await new Promise((resolve) => setTimeout(resolve, 300));

            // 단락 + 이미지 교차 배치
            for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
                // 첫 번째 단락은 볼드 처리 (핵심 요약 강조)
                if (pIdx === 0) {
                    await page.keyboard.down('Control');
                    await page.keyboard.press('b');
                    await page.keyboard.up('Control');
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }

                // 단락 텍스트 입력
                await typeWithRandomDelay(page, paragraphs[pIdx]);

                // 첫 번째 단락 볼드 해제
                if (pIdx === 0) {
                    await page.keyboard.down('Control');
                    await page.keyboard.press('b');
                    await page.keyboard.up('Control');
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }

                // 단락 사이 빈 줄 (네이버 SEO 가독성)
                await new Promise((resolve) => setTimeout(resolve, 100));
                await page.keyboard.press('Enter');
                await new Promise((resolve) => setTimeout(resolve, 50));
                await page.keyboard.press('Enter');
                await new Promise((resolve) => setTimeout(resolve, 100));

                // 이 단락 뒤에 배정된 이미지 삽입
                if (imagePositions[pIdx]) {
                    for (const imgIdx of imagePositions[pIdx]) {
                        const imagePath = path.join(imgsDir, allImageFiles[imgIdx]);
                        const success = await uploadImageWithRetry(page, frame, imagePath);
                        if (success) {
                            console.log(`  섹션${i + 1} 단락${pIdx + 1} 뒤 이미지 삽입: ${allImageFiles[imgIdx]}`);
                            await new Promise((resolve) => setTimeout(resolve, 500));
                            await page.keyboard.press('Enter');
                            await new Promise((resolve) => setTimeout(resolve, 300));
                        } else {
                            console.log(`❌ 이미지 업로드 실패: ${allImageFiles[imgIdx]}`);
                        }
                    }
                }
            }

            // 이미지 위치가 배정 안 된 나머지 이미지 처리 (단락이 0개인 경우 등)
            if (paragraphs.length === 0) {
                for (const imgIdx of assignedImages) {
                    const imagePath = path.join(imgsDir, allImageFiles[imgIdx]);
                    const success = await uploadImageWithRetry(page, frame, imagePath);
                    if (success) {
                        console.log(`  섹션${i + 1} 이미지 삽입: ${allImageFiles[imgIdx]}`);
                        await new Promise((resolve) => setTimeout(resolve, 500));
                        await page.keyboard.press('Enter');
                        await new Promise((resolve) => setTimeout(resolve, 300));
                    }
                }
            }

            // 글자 크기 기본값(15)으로 복원
            await changeFontSize(page, frame, '15');
            await new Promise((resolve) => setTimeout(resolve, 200));

            // 섹션 사이 구분을 위해 엔터 (마지막 섹션 제외)
            if (i < sectionCount - 1) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                await page.keyboard.press('Enter');
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }

        // USE_VIDEO 옵션에 따라 동영상 추가 (맨 아래에)
        if (USE_VIDEO === 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            await page.keyboard.press('Enter');
            await new Promise((resolve) => setTimeout(resolve, 500));
            await page.keyboard.press('Enter');
            await new Promise((resolve) => setTimeout(resolve, 500));
            // 동영상 슬라이드쇼 생성 시도
            console.log('\n제품 이미지로 동영상 슬라이드쇼 생성 중...');
            try {
                // imgs 폴더의 이미지들로 동영상 생성
                const videoTitle = resultData.키워드 ? resultData.키워드.substring(0, 10) : '제품';
                const videoPath = await createSlideshow(videoTitle);
                console.log(`동영상이 생성되었습니다: ${videoPath}`);

                // 동영상 업로드
                console.log('동영상 업로드 중...');
                let videoUploadSuccess = false;
                let videoRetryCount = 0;
                const maxVideoRetries = 3;

                while (!videoUploadSuccess && videoRetryCount < maxVideoRetries) {
                    try {
                        await uploadVideo(page, frame, videoPath, videoTitle);

                        // 파일 전송 오류 팝업 확인 및 처리
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                        const errorHandled = await handleFileTransferError(page, frame);

                        if (!errorHandled) {
                            videoUploadSuccess = true;
                            console.log('✅ 동영상 업로드 성공');
                        } else {
                            videoRetryCount++;
                            console.log(`⚠️ 동영상 파일 전송 오류 발생, 재시도 ${videoRetryCount}/${maxVideoRetries}`);
                            await new Promise((resolve) => setTimeout(resolve, 3000));
                        }
                    } catch (error) {
                        videoRetryCount++;
                        console.log(`⚠️ 동영상 업로드 오류 (${videoRetryCount}/${maxVideoRetries}): ${error.message}`);
                        await new Promise((resolve) => setTimeout(resolve, 3000));
                    }
                }

                if (!videoUploadSuccess) {
                    console.log('❌ 동영상 업로드 실패 (최대 재시도 초과), 이미지 갤러리로 대체합니다...');
                    throw new Error('동영상 업로드 재시도 한계 초과');
                }

            } catch (videoError) {
                console.error('동영상 생성 실패:', videoError.message);
                console.log('대신 이미지 갤러리로 대체합니다...');

                // 동영상 생성 실패시 이미지 갤러리로 대체
                const imgsDir = path.join(__dirname, 'imgs');
                if (fs.existsSync(imgsDir)) {
                    const imageFiles = fs.readdirSync(imgsDir)
                        .filter(file => file.startsWith('product_') && (file.endsWith('.jpg') || file.endsWith('.png')))
                        .sort((a, b) => {
                            const numA = parseInt(a.match(/product_(\d+)/)?.[1] || 0);
                            const numB = parseInt(b.match(/product_(\d+)/)?.[1] || 0);
                            return numA - numB;
                        })
                        .slice(0, 3); // 최대 3개 이미지만

                    for (let i = 0; i < imageFiles.length; i++) {
                        const imagePath = path.join(imgsDir, imageFiles[i]);
                        console.log(`갤러리 이미지 ${i + 1}/${imageFiles.length} 추가: ${imagePath}`);

                        // 갤러리 이미지 업로드 시도
                        let galleryUploadSuccess = false;
                        let galleryRetryCount = 0;
                        const maxGalleryRetries = 3;

                        while (!galleryUploadSuccess && galleryRetryCount < maxGalleryRetries) {
                            try {
                                await uploadImage(page, frame, imagePath);

                                // 파일 전송 오류 팝업 확인 및 처리
                                await new Promise((resolve) => setTimeout(resolve, 1000));
                                const errorHandled = await handleFileTransferError(page, frame);

                                if (!errorHandled) {
                                    galleryUploadSuccess = true;
                                    console.log(`✅ 갤러리 이미지 ${i + 1} 업로드 성공`);
                                } else {
                                    galleryRetryCount++;
                                    console.log(`⚠️ 갤러리 이미지 ${i + 1} 파일 전송 오류 발생, 재시도 ${galleryRetryCount}/${maxGalleryRetries}`);
                                    await new Promise((resolve) => setTimeout(resolve, 2000));
                                }
                            } catch (error) {
                                galleryRetryCount++;
                                console.log(`⚠️ 갤러리 이미지 ${i + 1} 업로드 오류 (${galleryRetryCount}/${maxGalleryRetries}): ${error.message}`);
                                await new Promise((resolve) => setTimeout(resolve, 2000));
                            }
                        }

                        if (!galleryUploadSuccess) {
                            console.log(`❌ 갤러리 이미지 ${i + 1} 업로드 실패 (최대 재시도 초과)`);
                        } else {
                            await new Promise((resolve) => setTimeout(resolve, 1500));
                        }
                    }
                }
            }
        } else {
            console.log('\nUSE_VIDEO=0: 동영상 생성을 건너뜅니다.');
        }


        const displayTitle = resultData.gemini.h1 || (resultData.gemini.sections[0] && resultData.gemini.sections[0].h2) || '';
        console.log(`\n포스팅 완료! 제목: ${displayTitle} | 키워드: ${resultData.키워드 || '-'}`);

        // 파일 정리 (imgs 폴더 내용과 result.json 삭제)
        await cleanupFiles();

        // 첫 번째 이미지를 제외한 랜덤 이미지를 대표 이미지로 설정 (발행 전)
        console.log('\n랜덤 이미지를 대표 이미지로 설정합니다...');
        try {
            await new Promise((resolve) => setTimeout(resolve, 1000));

            const repImageSet = await frame.evaluate(() => {
                const imageComponents = document.querySelectorAll('.se-component.se-image');
                if (imageComponents.length === 0) return false;

                // 랜덤으로 이미지 선택
                const randomIndex = Math.floor(Math.random() * imageComponents.length);
                const selectedImage = imageComponents[randomIndex];

                const repButton = selectedImage.querySelector('.se-set-rep-image-button');
                if (repButton) {
                    const isAlreadySelected = repButton.classList.contains('se-is-selected');
                    if (!isAlreadySelected) {
                        repButton.click();
                    }
                    return { success: true, selectedIndex: randomIndex + 1 };
                }
                return false;
            });

            if (repImageSet && repImageSet.success) {
                console.log(`✅ ${repImageSet.selectedIndex}번째 이미지가 대표 이미지로 설정되었습니다!`);
                await new Promise((resolve) => setTimeout(resolve, 1000)); // 설정 완료 대기
            } else {
                console.log('⚠️ 랜덤 이미지를 대표 이미지로 설정하지 못했습니다.');
            }

        } catch (repImageError) {
            console.log('대표 이미지 설정 중 오류:', repImageError.message);
        }

        // 발행 버튼 클릭
        console.log('\n발행 버튼을 찾는 중...');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        try {
            const publishSelectors = [
                'button.publish_btn__m9KHH',
                'button[data-click-area="tpb.publish"]',
                '.publish_btn_area__KjA2i button',
                'button:has(span.text__d09H7)',
                '.publish_btn_area__KjA2i .publish_btn__m9KHH'
            ];

            let publishClicked = false;

            // 1. iframe 내부에서 먼저 시도
            console.log('1. iframe 내부에서 발행 버튼 찾는 중...');
            for (const selector of publishSelectors) {
                try {
                    const publishBtn = await frame.$(selector);
                    if (publishBtn) {
                        await publishBtn.click();
                        console.log(`✅ iframe 내부에서 발행 버튼 클릭 성공! (선택자: ${selector})`);
                        publishClicked = true;
                        break;
                    }
                } catch (e) {
                    // 실패 시 다음 선택자 시도
                }
            }

            // iframe 내부 JavaScript로 시도
            if (!publishClicked) {
                try {
                    const result = await frame.evaluate(() => {
                        const btn = document.querySelector('button.publish_btn__m9KHH') ||
                            document.querySelector('button[data-click-area="tpb.publish"]');
                        if (btn) {
                            btn.click();
                            return true;
                        }
                        return false;
                    });
                    if (result) {
                        console.log('✅ iframe 내부 JavaScript로 발행 버튼 클릭 성공!');
                        publishClicked = true;
                    }
                } catch (e) {
                    // 실패 시 메인 페이지에서 시도
                }
            }

            // 2. 메인 페이지(iframe 밖)에서 시도
            if (!publishClicked) {
                console.log('2. 메인 페이지에서 발행 버튼 찾는 중...');
                for (const selector of publishSelectors) {
                    try {
                        const publishBtn = await page.$(selector);
                        if (publishBtn) {
                            await publishBtn.click();
                            console.log(`✅ 메인 페이지에서 발행 버튼 클릭 성공! (선택자: ${selector})`);
                            publishClicked = true;
                            break;
                        }
                    } catch (e) {
                        // 실패 시 다음 선택자 시도
                    }
                }
            }

            // 3. 메인 페이지 JavaScript로 직접 클릭 시도
            if (!publishClicked) {
                try {
                    const result = await page.evaluate(() => {
                        // 클래스명으로 찾기
                        const btn1 = document.querySelector('button.publish_btn__m9KHH');
                        if (btn1) {
                            btn1.click();
                            return 'button.publish_btn__m9KHH';
                        }

                        // data 속성으로 찾기
                        const btn2 = document.querySelector('button[data-click-area="tpb.publish"]');
                        if (btn2) {
                            btn2.click();
                            return 'button[data-click-area="tpb.publish"]';
                        }

                        // 텍스트로 찾기
                        const allButtons = document.querySelectorAll('button');
                        for (const btn of allButtons) {
                            if (btn.innerText === '발행' || btn.textContent === '발행') {
                                btn.click();
                                return 'text search';
                            }
                        }

                        return false;
                    });

                    if (result) {
                        console.log(`✅ 메인 페이지 JavaScript로 발행 버튼 클릭 성공! (방식: ${result})`);
                        publishClicked = true;
                    }
                } catch (e) {
                    console.log('JavaScript 발행 버튼 클릭 실패');
                }
            }

            if (publishClicked) {
                console.log('발행 프로세스가 시작되었습니다.');

                // 발행 설정 팝업이 나타날 때까지 대기
                await new Promise((resolve) => setTimeout(resolve, 3000));

                try {
                    // 파일 내 오래된 발행 기록 정리
                    cleanupOldRecordsInFile(POST_ID);

                    // 발행 기록 확인 (매번 최신으로 다시 읽기)
                    const records = loadPostedRecords(POST_ID);

                    console.log(`현재 발행 횟수: ${records.length}회`);
                    if (records.length > 0) {
                        const lastRecord = records[0]; // 시간순 정렬된 첫 번째가 최신
                        console.log(`마지막 발행 시간: ${lastRecord.date} ${String(lastRecord.hour).padStart(2, '0')}:${String(lastRecord.minute).padStart(2, '0')}`);
                    }

                    // 현재 시간 가져오기 (한국 시간)
                    const kstNow = getKSTTime();
                    console.log(`🕐 현재 KST 시간: ${kstNow.getFullYear()}-${String(kstNow.getMonth() + 1).padStart(2, '0')}-${String(kstNow.getDate()).padStart(2, '0')} ${String(kstNow.getHours()).padStart(2, '0')}:${String(kstNow.getMinutes()).padStart(2, '0')}`);

                    // 매번 최신 발행 기록 다시 읽기
                    const latestRecords = loadPostedRecords(POST_ID);

                    // 첫 발행 여부 판단: 기록 개수로만 판단
                    const isFirstPost = latestRecords.length === 0;

                    console.log(`현재 발행 상황: ${isFirstPost ? '첫 발행' : (latestRecords.length + 1) + '회차 발행'}`);

                    let finalHour, finalMinute, finalDate;

                    console.log(`📋 발행 모드: ${SCHEDULE_MODE}`);

                    if (SCHEDULE_MODE === 'instant') {
                        // ===== 즉시발행 모드 =====
                        // 즉시 발행 라디오 선택 (radio_time1) - frame과 page 모두 시도
                        let instantSelected = false;

                        // 즉시 발행 라디오 셀렉터 목록
                        const instantRadioSelectors = [
                            '[data-testid="nowTimeRadioBtn"]',
                            'input#radio_time1',
                            'label[for="radio_time1"]',
                            'input[name="publishTime"][value="now"]',
                            'input[name="publishTime"][value="current"]',
                            'input[type="radio"][id*="now"]',
                            'input[type="radio"][id*="time1"]',
                        ];

                        // 방법 1: frame에서 셀렉터로 찾기
                        instantSelected = await frame.evaluate((selectors) => {
                            for (const sel of selectors) {
                                const el = document.querySelector(sel);
                                if (el) { el.click(); return true; }
                            }
                            return false;
                        }, instantRadioSelectors).catch(() => false);

                        // 방법 2: page에서 셀렉터로 찾기
                        if (!instantSelected) {
                            instantSelected = await page.evaluate((selectors) => {
                                for (const sel of selectors) {
                                    const el = document.querySelector(sel);
                                    if (el) { el.click(); return true; }
                                }
                                return false;
                            }, instantRadioSelectors).catch(() => false);
                        }

                        // 방법 3: frame에서 텍스트("현재", "즉시")로 label/라디오 찾기
                        if (!instantSelected) {
                            instantSelected = await frame.evaluate(() => {
                                const labels = document.querySelectorAll('label');
                                for (const label of labels) {
                                    const text = label.textContent.trim();
                                    if (text === '현재' || text === '즉시' || text === '즉시발행' || text === '즉시 발행') {
                                        label.click();
                                        return true;
                                    }
                                }
                                return false;
                            }).catch(() => false);
                        }

                        // 방법 4: page에서 텍스트로 label/라디오 찾기
                        if (!instantSelected) {
                            instantSelected = await page.evaluate(() => {
                                const labels = document.querySelectorAll('label');
                                for (const label of labels) {
                                    const text = label.textContent.trim();
                                    if (text === '현재' || text === '즉시' || text === '즉시발행' || text === '즉시 발행') {
                                        label.click();
                                        return true;
                                    }
                                }
                                return false;
                            }).catch(() => false);
                        }

                        if (!instantSelected) {
                            console.log('⚠️ 즉시 발행 라디오를 찾지 못했습니다. 기본값(현재)으로 진행합니다.');
                        } else {
                            console.log('✅ 즉시 발행 선택 완료');
                        }
                        await new Promise((resolve) => setTimeout(resolve, 1000));

                        // 현재 KST 시간을 기록용으로 사용
                        finalHour = kstNow.getHours();
                        finalMinute = kstNow.getMinutes();
                        const year = kstNow.getFullYear();
                        const month = String(kstNow.getMonth() + 1).padStart(2, '0');
                        const day = String(kstNow.getDate()).padStart(2, '0');
                        finalDate = `${year}-${month}-${day}`;

                    } else if (SCHEDULE_MODE === 'manual') {
                        // ===== 직접지정 모드 =====
                        // 예약 발행 라디오 선택 (radio_time2) - frame과 page 모두 시도
                        let radioSelected = false;
                        const maxRetries = 3;

                        for (let attempt = 1; attempt <= maxRetries; attempt++) {
                            console.log(`예약 발행 선택 시도 ${attempt}/${maxRetries}...`);

                            // frame에서 시도
                            radioSelected = await frame.evaluate(() => {
                                const radio = document.querySelector('[data-testid="preTimeRadioBtn"]')
                                    || document.querySelector('input#radio_time2')
                                    || document.querySelector('label[for="radio_time2"]');
                                if (radio) { radio.click(); return true; }
                                return false;
                            }).catch(() => false);

                            // page에서 시도
                            if (!radioSelected) {
                                radioSelected = await page.evaluate(() => {
                                    const radio = document.querySelector('[data-testid="preTimeRadioBtn"]')
                                        || document.querySelector('input#radio_time2')
                                        || document.querySelector('label[for="radio_time2"]');
                                    if (radio) { radio.click(); return true; }
                                    // 텍스트로 찾기
                                    const labels = document.querySelectorAll('label');
                                    for (const label of labels) {
                                        if (label.textContent.trim() === '예약') { label.click(); return true; }
                                    }
                                    return false;
                                }).catch(() => false);
                            }

                            if (radioSelected) {
                                console.log(`✅ 예약 발행 선택 성공 (${attempt}번째 시도)`);
                                break;
                            } else {
                                console.log(`❌ 예약 발행 선택 실패 (${attempt}번째 시도)`);
                                if (attempt < maxRetries) await new Promise((resolve) => setTimeout(resolve, 2000));
                            }
                        }
                        if (!radioSelected) throw new Error(`예약 발행 선택 실패 (${maxRetries}번 시도 후 포기)`);
                        console.log('✅ 예약 발행 선택 완료');
                        await new Promise((resolve) => setTimeout(resolve, 2000));

                        // 환경변수에서 직접 지정된 시간 사용
                        finalHour = parseInt(SCHEDULE_HOUR) || kstNow.getHours();
                        finalMinute = parseInt(SCHEDULE_MINUTE) || 0;
                        finalDate = SCHEDULE_DATE || `${kstNow.getFullYear()}-${String(kstNow.getMonth() + 1).padStart(2, '0')}-${String(kstNow.getDate()).padStart(2, '0')}`;

                        console.log(`📅 직접 지정 발행 시간: ${finalDate} ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}`);

                        // 날짜 변경이 필요한 경우
                        const manualParts = finalDate.split('-');
                        const manualYear = parseInt(manualParts[0]);
                        const manualMonth = parseInt(manualParts[1]) - 1;
                        const manualDay = parseInt(manualParts[2]);
                        const isManualNextDay = manualDay !== kstNow.getDate() || manualMonth !== kstNow.getMonth() || manualYear !== kstNow.getFullYear();

                        if (isManualNextDay) {
                            console.log(`날짜를 변경합니다: → ${finalDate}`);
                            await frame.click('.input_date__QmA0s');
                            await new Promise(resolve => setTimeout(resolve, 1500));

                            const initialCalendarState = await frame.evaluate(() => {
                                const monthSpan = document.querySelector('.ui-datepicker-month');
                                const yearSpan = document.querySelector('.ui-datepicker-year');
                                return {
                                    month: monthSpan ? monthSpan.textContent : null,
                                    year: yearSpan ? yearSpan.textContent : null
                                };
                            });

                            const calendarMonth = initialCalendarState.month ? parseInt(initialCalendarState.month.replace('월', '')) - 1 : kstNow.getMonth();
                            const calendarYear = initialCalendarState.year ? parseInt(initialCalendarState.year.replace('년', '')) : kstNow.getFullYear();

                            let monthsToMove = 0;
                            if (manualYear > calendarYear) {
                                monthsToMove = (12 - calendarMonth - 1) + manualMonth + 1;
                            } else if (manualYear === calendarYear) {
                                monthsToMove = manualMonth - calendarMonth;
                            }

                            for (let i = 0; i < monthsToMove; i++) {
                                const nextButtonExists = await frame.evaluate(() => {
                                    const btn = document.querySelector('.ui-datepicker-next');
                                    return btn && !btn.disabled && btn.style.visibility !== 'hidden';
                                });
                                if (nextButtonExists) {
                                    await frame.click('.ui-datepicker-next');
                                    await new Promise(resolve => setTimeout(resolve, 800));
                                } else break;
                            }

                            await new Promise(resolve => setTimeout(resolve, 1000));
                            await frame.evaluate((date) => {
                                const dateButtons = document.querySelectorAll('.ui-datepicker td:not(.ui-state-disabled) button');
                                for (const btn of dateButtons) {
                                    if (btn.textContent.trim() === String(date)) { btn.click(); return true; }
                                }
                                return false;
                            }, manualDay);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }

                        // 시간과 분 설정
                        await frame.evaluate((hour) => {
                            const hourSelect = document.querySelector('.hour_option__J_heO');
                            if (hourSelect) { hourSelect.value = String(hour).padStart(2, '0'); hourSelect.dispatchEvent(new Event('change', { bubbles: true })); }
                        }, finalHour);
                        await frame.evaluate((minute) => {
                            const minuteSelect = document.querySelector('.minute_option__Vb3xB');
                            if (minuteSelect) { minuteSelect.value = String(minute).padStart(2, '0'); minuteSelect.dispatchEvent(new Event('change', { bubbles: true })); }
                        }, finalMinute);

                        console.log(`✅ 직접 지정 시간 설정 완료: ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}`);
                        await new Promise((resolve) => setTimeout(resolve, 1000));

                    } else {
                        // ===== 자동계산 모드 (기존 로직) =====
                        // 예약 발행 선택 - frame과 page 모두 시도
                        let radioSelected = false;
                        const maxRetries = 3;

                        for (let attempt = 1; attempt <= maxRetries; attempt++) {
                            console.log(`예약 발행 선택 시도 ${attempt}/${maxRetries}...`);

                            // frame에서 시도
                            radioSelected = await frame.evaluate(() => {
                                const radio = document.querySelector('[data-testid="preTimeRadioBtn"]')
                                    || document.querySelector('input#radio_time2')
                                    || document.querySelector('label[for="radio_time2"]');
                                if (radio) { radio.click(); return true; }
                                return false;
                            }).catch(() => false);

                            // page에서 시도
                            if (!radioSelected) {
                                radioSelected = await page.evaluate(() => {
                                    const radio = document.querySelector('[data-testid="preTimeRadioBtn"]')
                                        || document.querySelector('input#radio_time2')
                                        || document.querySelector('label[for="radio_time2"]');
                                    if (radio) { radio.click(); return true; }
                                    const labels = document.querySelectorAll('label');
                                    for (const label of labels) {
                                        if (label.textContent.trim() === '예약') { label.click(); return true; }
                                    }
                                    return false;
                                }).catch(() => false);
                            }

                            if (radioSelected) {
                                console.log(`✅ 예약 발행 선택 성공 (${attempt}번째 시도)`);
                                break;
                            } else {
                                console.log(`❌ 예약 발행 선택 실패 (${attempt}번째 시도)`);
                                if (attempt < maxRetries) {
                                    console.log('2초 후 재시도합니다...');
                                    await new Promise((resolve) => setTimeout(resolve, 2000));
                                }
                            }
                        }

                        if (!radioSelected) {
                            throw new Error(`예약 발행 선택 실패 (${maxRetries}번 시도 후 포기)`);
                        }

                        console.log('✅ 예약 발행 선택 완료');
                        await new Promise((resolve) => setTimeout(resolve, 2000));

                        if (isFirstPost) {
                            // 1. 첫 발행인 경우: 네이버 기본 설정 시간 추출
                            const autoSettings = await frame.evaluate(() => {
                                const hourSelect = document.querySelector('.hour_option__J_heO');
                                const minuteSelect = document.querySelector('.minute_option__Vb3xB');

                                if (hourSelect && minuteSelect) {
                                    return {
                                        hour: parseInt(hourSelect.value),
                                        minute: parseInt(minuteSelect.value)
                                    };
                                }
                                return null;
                            });

                            if (autoSettings) {
                                finalHour = autoSettings.hour;
                                finalMinute = autoSettings.minute;

                                // 네이버 기본 설정 시간의 날짜 계산 (현재 시간 + 10분 기준)
                                const scheduledTime = new Date(kstNow.getTime() + 10 * 60000);
                                const year = scheduledTime.getFullYear();
                                const month = String(scheduledTime.getMonth() + 1).padStart(2, '0');
                                const day = String(scheduledTime.getDate()).padStart(2, '0');
                                finalDate = `${year}-${month}-${day}`;

                                console.log(`✅ 네이버 기본 설정 시간: ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}, 날짜: ${finalDate}`);
                            } else {
                                throw new Error('네이버 기본 설정 시간 추출 실패');
                            }
                        } else {
                            // 2. 2회차 이상인 경우: calculateNextPostTime으로 다음 시간 계산
                            const postTime = calculateNextPostTime(latestRecords);

                            // calculateNextPostTime에서 반환된 완전한 날짜 시간 객체 사용
                            const scheduledTime = postTime.scheduledTime;

                            finalHour = postTime.hour;
                            finalMinute = postTime.minute;

                            // 날짜 문자열 생성
                            const year = scheduledTime.getFullYear();
                            const month = String(scheduledTime.getMonth() + 1).padStart(2, '0');
                            const day = String(scheduledTime.getDate()).padStart(2, '0');
                            finalDate = `${year}-${month}-${day}`;

                            const isNextDay = scheduledTime.getDate() !== kstNow.getDate() ||
                                scheduledTime.getMonth() !== kstNow.getMonth() ||
                                scheduledTime.getFullYear() !== kstNow.getFullYear();

                            console.log(`✅ 계산된 다음 발행 시간: ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')} ${isNextDay ? '(다음날)' : '(오늘)'}`);

                            // 날짜 변경이 필요한 경우
                            if (isNextDay) {
                                console.log(`날짜를 변경합니다: ${kstNow.getFullYear()}-${String(kstNow.getMonth() + 1).padStart(2, '0')}-${String(kstNow.getDate()).padStart(2, '0')} → ${String(scheduledTime.getFullYear())}-${String(scheduledTime.getMonth() + 1).padStart(2, '0')}-${String(scheduledTime.getDate()).padStart(2, '0')}`);

                                // 달력 열기
                                await frame.click('.input_date__QmA0s');
                                await new Promise(resolve => setTimeout(resolve, 1500));

                                // 달력이 열린 후 현재 달력의 월 확인
                                const initialCalendarState = await frame.evaluate(() => {
                                    const monthSpan = document.querySelector('.ui-datepicker-month');
                                    const yearSpan = document.querySelector('.ui-datepicker-year');
                                    return {
                                        month: monthSpan ? monthSpan.textContent : null,
                                        year: yearSpan ? yearSpan.textContent : null
                                    };
                                });
                                console.log(`📅 달력 초기 상태: ${initialCalendarState.year} ${initialCalendarState.month}`);

                                const targetDate = scheduledTime.getDate();
                                const targetYear = scheduledTime.getFullYear();
                                const targetMonth = scheduledTime.getMonth();

                                // 실제 달력에 표시된 월을 파싱해서 사용 (한국어 "9월" → 숫자 8)
                                const calendarMonth = initialCalendarState.month ?
                                    parseInt(initialCalendarState.month.replace('월', '')) - 1 : // "9월" → 8
                                    kstNow.getMonth(); // fallback
                                const calendarYear = initialCalendarState.year ?
                                    parseInt(initialCalendarState.year.replace('년', '')) : // "2025년" → 2025
                                    kstNow.getFullYear(); // fallback

                                console.log(`🎯 목표: ${targetYear}년 ${targetMonth + 1}월 ${targetDate}일`);
                                console.log(`📍 달력 현재: ${calendarYear}년 ${calendarMonth + 1}월`);

                                // 실제 달력 표시 월을 기준으로 계산
                                let monthsToMove = 0;
                                if (targetYear > calendarYear) {
                                    // 다음 연도인 경우
                                    monthsToMove = (12 - calendarMonth - 1) + targetMonth + 1;
                                    console.log(`📊 연도 넘김: ${calendarYear} → ${targetYear}, 이동할 월 수: ${monthsToMove}`);
                                } else if (targetYear === calendarYear) {
                                    // 같은 연도 내에서 월 비교
                                    monthsToMove = targetMonth - calendarMonth;
                                    console.log(`📊 같은 연도 내: ${calendarMonth + 1}월 → ${targetMonth + 1}월, 이동할 월 수: ${monthsToMove}`);
                                } else if (targetYear < calendarYear) {
                                    // 이전 연도인 경우 (거의 없지만 혹시)
                                    console.log(`⚠️ 경고: 목표 연도가 달력 현재 연도보다 이전입니다!`);
                                    monthsToMove = 0; // 안전하게 0으로 설정
                                }

                                console.log(`📋 최종 계산: ${monthsToMove}개월 이동 필요`);

                                // 필요한 만큼 다음달 버튼 클릭 (안전하게 한 번에 하나씩)
                                for (let i = 0; i < monthsToMove; i++) {
                                    console.log(`다음달 버튼 클릭 ${i + 1}/${monthsToMove}`);

                                    // 버튼이 존재하는지 확인 후 클릭
                                    const nextButtonExists = await frame.evaluate(() => {
                                        const btn = document.querySelector('.ui-datepicker-next');
                                        return btn && !btn.disabled && btn.style.visibility !== 'hidden';
                                    });

                                    if (nextButtonExists) {
                                        await frame.click('.ui-datepicker-next');
                                        await new Promise(resolve => setTimeout(resolve, 800)); // 각 클릭 후 충분한 대기

                                        // 실제로 달력이 변경되었는지 확인
                                        const currentCalendarMonth = await frame.evaluate(() => {
                                            const monthSpan = document.querySelector('.ui-datepicker-month');
                                            return monthSpan ? monthSpan.textContent : null;
                                        });
                                        console.log(`현재 달력 월: ${currentCalendarMonth}`);
                                    } else {
                                        console.log('⚠️ 다음달 버튼을 찾을 수 없거나 비활성화됨');
                                        break;
                                    }
                                }

                                // 추가 대기 후 날짜 선택
                                await new Promise(resolve => setTimeout(resolve, 1000));

                                // 목표 날짜 클릭
                                const dateClicked = await frame.evaluate((date) => {
                                    const dateButtons = document.querySelectorAll('.ui-datepicker td:not(.ui-state-disabled) button');
                                    console.log(`사용 가능한 날짜 버튼 수: ${dateButtons.length}`);

                                    for (const btn of dateButtons) {
                                        if (btn.textContent.trim() === String(date)) {
                                            console.log(`날짜 ${date}일 버튼 찾음, 클릭 시도`);
                                            btn.click();
                                            return true;
                                        }
                                    }
                                    return false;
                                }, targetDate);

                                if (dateClicked) {
                                    console.log(`✅ 날짜 ${targetDate}일 선택 완료`);
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                } else {
                                    console.log(`⚠️ 날짜 ${targetDate}일 선택 실패 - 해당 날짜를 찾을 수 없습니다`);
                                }
                            }

                            // 시간과 분 설정
                            const hourSet = await frame.evaluate((hour) => {
                                const hourSelect = document.querySelector('.hour_option__J_heO');
                                if (hourSelect) {
                                    hourSelect.value = String(hour).padStart(2, '0');
                                    hourSelect.dispatchEvent(new Event('change', { bubbles: true }));
                                    return true;
                                }
                                return false;
                            }, finalHour);

                            const minuteSet = await frame.evaluate((minute) => {
                                const minuteSelect = document.querySelector('.minute_option__Vb3xB');
                                if (minuteSelect) {
                                    minuteSelect.value = String(minute).padStart(2, '0');
                                    minuteSelect.dispatchEvent(new Event('change', { bubbles: true }));
                                    return true;
                                }
                                return false;
                            }, finalMinute);

                            if (!hourSet || !minuteSet) {
                                throw new Error('시간 설정 실패');
                            }

                            console.log(`✅ 예약 시간 설정 완료: ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}`);
                            await new Promise((resolve) => setTimeout(resolve, 1000));
                        }
                    }

                    // 3. 최종 발행 버튼 클릭 (다중 셀렉터 + frame/page 양쪽 시도)
                    const finalPublishSelectors = [
                        'button[data-testid="seOnePublishBtn"]',
                        'button[data-testid="publishBtn"]',
                        'button[data-click-area="tpb.confirm"]',
                        '.confirm_btn__',
                    ];
                    let finalPublishClicked = false;

                    // 방법 1: frame에서 셀렉터로 찾기
                    for (const sel of finalPublishSelectors) {
                        try {
                            await frame.waitForSelector(sel, { timeout: 2000 });
                            await frame.click(sel);
                            finalPublishClicked = true;
                            console.log(`✅ 발행 완료! (frame: ${sel})`);
                            break;
                        } catch (_) {}
                    }

                    // 방법 2: page에서 셀렉터로 찾기
                    if (!finalPublishClicked) {
                        for (const sel of finalPublishSelectors) {
                            try {
                                await page.waitForSelector(sel, { timeout: 2000 });
                                await page.click(sel);
                                finalPublishClicked = true;
                                console.log(`✅ 발행 완료! (page: ${sel})`);
                                break;
                            } catch (_) {}
                        }
                    }

                    // 방법 3: frame에서 텍스트("발행")로 버튼 찾기
                    if (!finalPublishClicked) {
                        finalPublishClicked = await frame.evaluate(() => {
                            const buttons = document.querySelectorAll('button');
                            for (const btn of buttons) {
                                const text = btn.textContent.trim();
                                if (text === '발행' || text === '발행하기' || text === '등록') {
                                    btn.click();
                                    return true;
                                }
                            }
                            return false;
                        }).catch(() => false);
                        if (finalPublishClicked) console.log('✅ 발행 완료! (frame 텍스트 검색)');
                    }

                    // 방법 4: page에서 텍스트("발행")로 버튼 찾기
                    if (!finalPublishClicked) {
                        finalPublishClicked = await page.evaluate(() => {
                            const buttons = document.querySelectorAll('button');
                            for (const btn of buttons) {
                                const text = btn.textContent.trim();
                                if (text === '발행' || text === '발행하기' || text === '등록') {
                                    btn.click();
                                    return true;
                                }
                            }
                            return false;
                        }).catch(() => false);
                        if (finalPublishClicked) console.log('✅ 발행 완료! (page 텍스트 검색)');
                    }

                    if (!finalPublishClicked) {
                        throw new Error('최종 발행 버튼을 찾을 수 없습니다.');
                    }

                    // 4. URL 캡처 시도 (발행된 글의 실제 URL)
                    let capturedUrl = '';
                    try {
                        // 발행 후 리다이렉트 완료 대기 (최대 15초 폴링)
                        for (let urlTry = 0; urlTry < 15; urlTry++) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            const currentUrl = page.url();
                            // 에디터/Write URL이 아닌 실제 포스트 URL인지 확인
                            if (currentUrl && currentUrl.includes('blog.naver.com') &&
                                !currentUrl.includes('Redirect=Write') &&
                                !currentUrl.includes('/postwrite') &&
                                !currentUrl.includes('/editor') &&
                                /\/\d{10,}/.test(currentUrl)) {
                                capturedUrl = currentUrl;
                                console.log(`🔗 포스팅 URL 캡처: ${capturedUrl}`);
                                break;
                            }
                        }
                        if (!capturedUrl) {
                            // 폴링 실패 시 BLOG_ID + logNo로 URL 직접 구성 시도
                            const finalUrl = page.url();
                            const logNoMatch = finalUrl && finalUrl.match(/logNo=(\d+)/);
                            if (logNoMatch && BLOG_ID) {
                                capturedUrl = `https://blog.naver.com/${BLOG_ID}/${logNoMatch[1]}`;
                                console.log(`🔗 포스팅 URL 구성: ${capturedUrl}`);
                            } else {
                                console.log('⚠️ 발행된 글 URL을 캡처하지 못했습니다.');
                            }
                        }
                    } catch (urlError) {
                        console.log('URL 캡처 실패 (무시됨):', urlError.message);
                    }

                    // 5. 최종 발행 기록 저장 (한 번만 저장)
                    savePostedRecord(POST_ID, finalHour, finalMinute, finalDate, capturedUrl);
                    console.log(`발행 기록 저장 완료: ${finalDate} ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}${capturedUrl ? ' URL: ' + capturedUrl : ''}`);

                    // 발행 처리 완료 대기 (5~7초 랜덤)
                    const waitTime = Math.floor(Math.random() * 2000) + 5000; // 5000~7000ms 랜덤
                    console.log(`발행 완료 후 ${(waitTime / 1000).toFixed(1)}초 대기합니다...`);
                    await new Promise((resolve) => setTimeout(resolve, waitTime));

                    // 5. 브라우저 종료
                    console.log('발행이 완료되어 브라우저를 종료합니다.');
                    isShuttingDown = true;
                    try {
                        await browser.close();
                    } catch (closeError) {
                        console.log('브라우저 종료 중 오류 (무시됨):', closeError.message);
                    }

                    // 프로세스 완전 종료 대기
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    process.exit(0);

                } catch (settingsError) {
                    console.error('발행 설정 처리 중 오류:', settingsError.message);
                    isShuttingDown = true;
                    try {
                        await browser.close();
                        console.log('브라우저가 정상적으로 종료되었습니다.');
                    } catch (closeError) {
                        console.log('브라우저 종료 중 오류 (무시됨):', closeError.message);
                    }
                    process.exit(1);
                }

                // 발행 설정 처리 후 종료 (위의 try-catch 블록에서 처리됨)
            } else {
                console.log('발행 버튼을 찾을 수 없습니다. 프로그램을 종료합니다.');
                isShuttingDown = true;
                try {
                    await browser.close();
                    console.log('브라우저가 정상적으로 종료되었습니다.');
                } catch (closeError) {
                    console.log('브라우저 종료 중 오류 (무시됨):', closeError.message);
                }
                process.exit(1);
            }

        } catch (error) {
            console.error('발행 버튼 클릭 중 오류:', error.message);
            isShuttingDown = true;
            try {
                await browser.close();
                console.log('브라우저가 정상적으로 종료되었습니다.');
            } catch (closeError) {
                console.log('브라우저 종료 중 오류 (무시됨):', closeError.message);
            }
            process.exit(1);
        }

        // 이 부분은 실행되지 않음 (위에서 이미 종료)

    } catch (error) {
        console.error("글쓰기 중 오류 발생:", error.message);
        isShuttingDown = true;
        try {
            await browser.close();
            console.log('브라우저가 정상적으로 종료되었습니다.');
        } catch (closeError) {
            console.log('브라우저 종료 중 오류 (무시됨):', closeError.message);
        }
        process.exit(1);
    }
}

// 블로그 ID 추출 함수
async function fetchBlogId(cookieString) {
    try {
        const response = await axios.get('https://section.blog.naver.com/ajax/BlogUserInfo.naver', {
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'ko,en-US;q=0.9,en;q=0.8',
                'cache-control': 'no-cache',
                'cookie': cookieString,
                'pragma': 'no-cache',
                'referer': 'https://section.blog.naver.com/BlogHome.naver',
                'user-agent': getRandomUserAgent()
            }
        });

        // 응답 데이터 파싱
        let responseData = response.data;
        if (typeof responseData === 'string') {
            // ")]}',\n" 제거
            responseData = responseData.replace(/^\)\]\}',\n/, '');
            responseData = JSON.parse(responseData);
        }

        if (responseData.result && responseData.result.domainIdOrUserId) {
            return responseData.result.domainIdOrUserId;
        }

        return null;
    } catch (error) {
        console.error('블로그 ID 추출 실패:', error.message);
        return null;
    }
}


async function visitNaver() {
    // 먼저 임시 폴더 정리
    cleanupTempDirectories();

    // 환경변수 체크
    if (!POST_ID || !POST_PASSWORD) {
        console.error('환경변수에 POST_ID, POST_PASSWORD가 설정되어야 합니다.');
        console.error('현재 설정:');
        console.error(`  POST_ID: ${POST_ID ? '설정됨' : '미설정'}`);
        console.error(`  POST_PASSWORD: ${POST_PASSWORD ? '설정됨' : '미설정'}`);
        return;
    }

    // cookies JSON 파일 확인, 없으면 로그인 실행
    let cookieFilePath = getCookieFilePath(POST_ID);
    if (!fs.existsSync(cookieFilePath)) {
        console.log('cookies JSON 파일이 없습니다. login-module을 실행합니다...');
        const loginSuccess = await login(POST_ID, POST_PASSWORD);

        if (!loginSuccess) {
            console.error('로그인에 실패했습니다.');
            return;
        }

        console.log('로그인 성공!');
        // 로그인 후 다시 쿠키 파일 경로 확인
        cookieFilePath = getCookieFilePath(POST_ID);
    }

    // cookies JSON에서 블로그 ID 확인
    if (fs.existsSync(cookieFilePath)) {
        try {
            const loginData = JSON.parse(fs.readFileSync(cookieFilePath, 'utf8'));

            // cookies를 문자열로 변환
            let cookieString = '';
            if (Array.isArray(loginData)) {
                cookieString = loginData.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
            } else if (loginData.cookies) {
                cookieString = loginData.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
            }

            // 블로그 ID가 없거나 비어있으면 추출
            if (!loginData.blogId || loginData.blogId === '') {
                console.log('블로그 ID가 없습니다. 자동으로 추출합니다...');
                if (cookieString) {
                    const extractedBlogId = await fetchBlogId(cookieString);
                    if (extractedBlogId) {
                        BLOG_ID = extractedBlogId;
                        updateBlogIdInCookies(POST_ID, BLOG_ID, getCookieFilePath);
                        console.log(`블로그 ID 추출 성공: ${BLOG_ID}`);
                    } else {
                        console.error('블로그 ID를 추출할 수 없습니다.');
                        return;
                    }
                }
            } else {
                BLOG_ID = loginData.blogId;
                console.log(`저장된 블로그 ID 사용: ${BLOG_ID}`);
            }
        } catch (error) {
            console.error('cookies JSON 파일 읽기 실패:', error);
        }
    }

    if (!BLOG_ID) {
        console.error('블로그 ID를 확인할 수 없습니다.');
        return;
    }

    // 계정별 랜덤 User-Agent 선택
    const selectedUA = getRandomUserAgent();
    console.log(`🌐 User-Agent: ${selectedUA.substring(0, 60)}...`);

    // 계정별 임시 userDataDir 생성 (독립된 브라우저 프로필)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `naver-post-${POST_ID}-`));
    console.log(`임시 프로필 디렉토리 생성: ${tempDir}`);

    // 랜덤 화면 크기 (핑거프린트 다양화)
    const screenSizes = [
        { width: 1920, height: 1080 },
        { width: 1536, height: 864 },
        { width: 1440, height: 900 },
        { width: 1366, height: 768 },
        { width: 1280, height: 720 },
    ];
    const randomScreen = screenSizes[Math.floor(Math.random() * screenSizes.length)];

    // Chrome 경로 찾기
    const chromePath = findChromePath();

    // 브라우저 실행 (자동화 탐지 우회 설정 강화)
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        userDataDir: tempDir,
        executablePath: chromePath, // 시스템 Chrome 사용
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-web-security",
            "--disable-features=VizDisplayCompositor,IsolateOrigins,site-per-process",
            "--disable-blink-features=AutomationControlled", // 자동화 탐지 방지
            "--no-first-run",
            "--disable-default-apps",
            "--disable-popup-blocking",
            "--disable-translate",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            "--disable-ipc-flooding-protection",
            "--disable-component-update",
            "--disable-domain-reliability",
            "--disable-features=TranslateUI",
            "--metrics-recording-only",
            "--mute-audio",
            `--window-size=${randomScreen.width},${randomScreen.height}`,
            `--user-agent=${selectedUA}`,
        ],
    });

    // 매 실행마다 종료 플래그 초기화 (모듈 레벨 변수 사용)
    isShuttingDown = false;

    // 브라우저 종료 감지 이벤트 리스너 추가
    // 사용자가 브라우저를 수동으로 닫았을 때만 process.exit
    browser.on('disconnected', () => {
        if (!isShuttingDown) {
            console.log('브라우저가 종료되었습니다. 프로그램을 종료합니다.');
            process.exit(0);
        }
    });

    try {
        const page = (await browser.pages())[0];

        // 페이지가 닫히면 브라우저도 종료
        page.on('close', () => {
            if (!isShuttingDown) {
                console.log('페이지가 닫혔습니다. 브라우저를 종료합니다.');
                browser.close().catch(() => { });
            }
        });

        // 자동화 탐지 우회 스크립트 주입 (강화)
        await page.evaluateOnNewDocument(() => {
            // webdriver 속성 제거
            Object.defineProperty(navigator, "webdriver", {
                get: () => undefined,
            });

            // plugins 배열을 실제 브라우저처럼 구성
            Object.defineProperty(navigator, "plugins", {
                get: () => {
                    const plugins = [
                        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
                    ];
                    plugins.length = 3;
                    return plugins;
                },
            });

            // languages 설정
            Object.defineProperty(navigator, "languages", {
                get: () => ["ko-KR", "ko", "en-US", "en"],
            });

            // hardwareConcurrency 랜덤화
            Object.defineProperty(navigator, "hardwareConcurrency", {
                get: () => [4, 8, 12, 16][Math.floor(Math.random() * 4)],
            });

            // deviceMemory 랜덤화
            Object.defineProperty(navigator, "deviceMemory", {
                get: () => [4, 8, 16][Math.floor(Math.random() * 3)],
            });

            // platform 설정
            Object.defineProperty(navigator, "platform", {
                get: () => "Win32",
            });

            // Chrome 객체 추가 (자동화 탐지 우회)
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {},
            };

            // permissions 처리
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) =>
                parameters.name === "notifications"
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);

            // WebGL Vendor/Renderer 랜덤화
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(param) {
                if (param === 37445) return 'Google Inc. (Intel)';
                if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)';
                return getParameter.call(this, param);
            };
        });

        // User-Agent 설정 (랜덤 선택된 UA 사용)
        await page.setUserAgent(selectedUA);

        // 추가 헤더 설정
        await page.setExtraHTTPHeaders({
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        });

        // 저장된 쿠키가 있으면 로드 (loadLoginData 내부에서 페이지 이동 처리)
        const hasStoredData = await loadLoginData(page, POST_ID);

        if (!hasStoredData) {
            // 저장된 데이터가 없으면 새로 네이버로 이동
            await page.goto("https://www.naver.com", {
                waitUntil: "networkidle2",
            });
        }

        console.log("네이버에 성공적으로 접속했습니다!");
        console.log(`임시 프로필 경로: ${tempDir}`);
        if (hasStoredData) {
            console.log("저장된 로그인 데이터를 사용합니다.");

            // 쿠키가 적용되도록 잠시 대기
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 페이지 새로고침하여 쿠키 적용
            await page.reload({ waitUntil: 'networkidle2' });
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const title = await page.title();
        console.log("페이지 제목:", title);

        // 로그인 상태 확인 및 로그인 시도
        try {
            // 1. 실제 로그인 상태 확인 (쿠키 유효성 검증)
            console.log('\n🔍 로그인 상태 확인 중...');

            // 로그인 버튼 존재 여부로 로그인 상태 확인
            const loginButtonExists = await page.evaluate(() => {
                // 로그인 버튼들 확인 - 텍스트 기반으로 더 정확하게 확인
                const loginButton = document.querySelector('.MyView-module__my_login___tOTgr');
                if (loginButton) {
                    return true;
                }

                // 로그인 텍스트가 있는 링크 찾기
                const links = document.querySelectorAll('a');
                for (const link of links) {
                    if (link.textContent && link.textContent.trim() === '로그인') {
                        return true;
                    }
                }

                return false;
            });

            // 프로필 영역 존재 여부로 로그인 상태 확인
            const profileExists = await page.evaluate(() => {
                const profileSelectors = [
                    '.MyView-module__my_area___j_4_D', // 마이 영역
                    '.MyView-module__profile_area___2wQg4', // 프로필 영역
                    '.MyView-module__user_info___1wWqg', // 사용자 정보
                    '.gnb_my', // 기존 GNB 마이 영역
                    '.my_area', // 마이 영역 일반
                ];

                return profileSelectors.some(selector => {
                    try {
                        return document.querySelector(selector) !== null;
                    } catch (e) {
                        return false;
                    }
                });
            });

            // 로그인 상태 판단 - 로그인 버튼이 없으면 로그인 된 것으로 간주
            const isLoggedIn = !loginButtonExists;

            if (isLoggedIn) {
                console.log('✅ 로그인 상태 확인: 로그인되어 있습니다.');
            } else {
                console.log('❌ 로그인 필요: 로그인 버튼이 감지되었습니다.');
            }

            if (!isLoggedIn) {
                console.log("\n⚠️ 쿠키가 만료되었거나 로그인이 필요합니다.");

                // 만료된 쿠키 파일 백업 및 삭제
                const cookieFilePath = getCookieFilePath(POST_ID);
                if (fs.existsSync(cookieFilePath)) {
                    const backupPath = cookieFilePath.replace('.json', '_expired.json');
                    try {
                        fs.copyFileSync(cookieFilePath, backupPath);
                        fs.unlinkSync(cookieFilePath);
                        console.log(`📄 만료된 쿠키 파일을 백업했습니다: ${path.basename(backupPath)}`);
                    } catch (backupError) {
                        console.log('쿠키 파일 백업 실패:', backupError.message);
                    }
                }

                console.log("🔄 login-module을 사용하여 새로 로그인합니다...");

                // 브라우저 닫기
                try {
                    await browser.close();
                    console.log('🔒 기존 브라우저를 정상적으로 닫았습니다.');
                } catch (closeError) {
                    console.log('브라우저 닫기 중 오류 (무시됨):', closeError.message);
                }

                // 잠시 대기 (브라우저 완전 종료 대기)
                await new Promise(resolve => setTimeout(resolve, 2000));

                // login-module 사용하여 로그인
                console.log('🔑 새로운 브라우저에서 로그인을 시도합니다...');
                const loginSuccess = await login(POST_ID, POST_PASSWORD);

                if (!loginSuccess) {
                    console.error("❌ 로그인에 실패했습니다.");
                    console.error("💡 다음을 확인해주세요:");
                    console.error("   1. settings/post_id.txt의 아이디/비밀번호가 정확한지");
                    console.error("   2. 계정이 보호 조치되지 않았는지");
                    console.error("   3. 네트워크 연결이 안정적인지");

                    // 로그인 실패 시 프로그램 종료
                    process.exit(1);
                }

                console.log("✅ 로그인 성공! 새로운 쿠키가 저장되었습니다.");
                console.log(`📁 새 쿠키 저장 위치: cookies/${POST_ID}_cookies.json`);
                console.log("");
                console.log("🔄 자동화 프로그램에서 실행 중인 경우:");
                console.log("   → 프로그램이 자동으로 3.post.js를 재시도합니다.");
                console.log("");
                console.log("📝 수동으로 실행 중인 경우:");
                console.log("   → 이 프로그램을 종료하고 다시 실행해주세요.");
                console.log("");

                // 로그인 성공 후 프로그램 정상 종료 (4.auto_run.js에서 재시도됨)
                process.exit(0);
            }

            console.log("로그인되어 있습니다.");

            // 블로그 링크 클릭
            try {
                console.log("블로그 링크를 클릭합니다...");

                // 여러 선택자 시도
                const blogSelectors = [
                    'a.MyView-module__item_link___Dzbpq:has(span.MyView-module__item_text___VTQQM)',
                    'a[href*="blog"]:has(span:contains("블로그"))',
                    '.MyView-module__item_link___Dzbpq',
                    'a:has(.MyView-module__item_text___VTQQM)',
                ];

                let blogClicked = false;

                for (const selector of blogSelectors) {
                    try {
                        const blogLink = await page.$(selector);
                        if (blogLink) {
                            // 텍스트 확인
                            const linkText = await page.evaluate(el => el.textContent, blogLink);
                            if (linkText && linkText.includes('블로그')) {
                                await blogLink.click();
                                console.log(`✅ 블로그 링크 클릭 성공! (선택자: ${selector})`);
                                blogClicked = true;
                                break;
                            }
                        }
                    } catch (e) {
                        // 다음 선택자 시도
                    }
                }

                // JavaScript로 직접 클릭 시도
                if (!blogClicked) {
                    try {
                        const result = await page.evaluate(() => {
                            // 텍스트로 블로그 링크 찾기
                            const links = document.querySelectorAll('a');
                            for (const link of links) {
                                if (link.textContent.includes('블로그')) {
                                    link.click();
                                    return true;
                                }
                            }
                            return false;
                        });

                        if (result) {
                            console.log('✅ JavaScript로 블로그 링크 클릭 성공!');
                            blogClicked = true;
                        }
                    } catch (e) {
                        // 무시
                    }
                }

                if (blogClicked) {
                    await new Promise((resolve) => setTimeout(resolve, 3000)); // 클릭 후 대기

                    // 새 탭이 열렸는지 확인하고 전환
                    const pages = await browser.pages();
                    console.log(`현재 열린 탭 수: ${pages.length}`);

                    let targetPage = page;
                    if (pages.length > 1) {
                        // 새 탭이 열렸다면 가장 최근 탭으로 전환
                        targetPage = pages[pages.length - 1];
                        console.log('🔄 새 탭으로 전환합니다...');
                        await new Promise((resolve) => setTimeout(resolve, 2000)); // 새 탭 로딩 대기
                    }

                    // 블로그 상태 확인 및 처리
                    const result = await checkAndHandleBlogStatus(targetPage);

                    if (result === false) {
                        // 블로그 생성 버튼을 찾을 수 없는 경우
                        console.log('❌ 블로그 상태를 확인할 수 없습니다. 프로그램을 종료합니다.');
                        await browser.close();
                        return;
                    } else if (result === 'manual_creation_needed') {
                        // 자동 생성 실패 또는 수동 생성이 필요한 경우 - 브라우저를 열어둠
                        console.log('⏳ 블로그 생성을 위해 브라우저를 열어둡니다...');
                        console.log('🔄 블로그 생성 완료 후 이 프로그램을 다시 실행해주세요.');

                        // 브라우저를 열어둔 상태로 유지 (사용자가 수동으로 닫을 때까지)
                        console.log('브라우저가 열려있습니다. 블로그 생성 완료 후 브라우저를 닫으면 프로그램이 종료됩니다.');

                        // 무한 대기 (브라우저 종료 시 disconnected 이벤트로 프로세스 종료)
                        while (browser.isConnected()) {
                            await new Promise((resolve) => setTimeout(resolve, 1000));
                        }
                        return;
                    } else if (result === 'creation_completed_need_manual_check') {
                        // 블로그 생성은 완료되었지만 ID 추출 실패
                        console.log('✅ 블로그 생성이 완료되었습니다!');
                        console.log('⚠️ 하지만 블로그 ID 추출에 실패했습니다.');
                        console.log('🔄 브라우저를 닫고 프로그램을 다시 실행해주세요.');

                        // 브라우저를 열어둔 상태로 유지
                        while (browser.isConnected()) {
                            await new Promise((resolve) => setTimeout(resolve, 1000));
                        }
                        return;
                    } else if (result.success && result.blogId) {
                        // 블로그 ID가 추출된 경우 (기존 블로그 또는 새로 생성된 블로그)
                        if (BLOG_ID !== result.blogId) {
                            console.log(`🔄 블로그 ID 업데이트: ${BLOG_ID} → ${result.blogId}`);
                            BLOG_ID = result.blogId;

                            // cookies JSON 파일 업데이트
                            updateBlogIdInCookies(POST_ID, result.blogId, getCookieFilePath);
                        }

                        // 새 탭이 열렸다면 정리하고 원래 탭으로 돌아가기
                        if (targetPage !== page) {
                            console.log('🗂️ 블로그 처리 완료, 새 탭을 닫고 원래 탭으로 돌아갑니다...');

                            try {
                                // 새 탭 닫기
                                await targetPage.close();
                                console.log('✅ 새 탭이 성공적으로 닫혔습니다.');
                            } catch (closeError) {
                                console.log('⚠️ 새 탭 닫기 중 오류:', closeError.message);
                            }

                            // 원래 탭으로 포커스 이동
                            await page.bringToFront();
                            console.log('🔄 원래 탭으로 돌아갔습니다.');

                            // 원래 탭 로딩 대기
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }

                        console.log('✅ 블로그 상태 확인 및 처리가 완료되었습니다. 포스팅을 계속 진행합니다...');
                    }
                } else {
                    console.log('⚠️ 블로그 링크를 찾을 수 없습니다. 계속 진행합니다.');
                }

            } catch (blogError) {
                console.log('블로그 링크 클릭 중 오류:', blogError.message);
                // 오류가 있어도 계속 진행
            }

            // 로그인 확인 후 대기 시간 적용
            if (LOGIN_WAIT_MINUTES > 0) {
                const waitTime = LOGIN_WAIT_MINUTES * 60 * 1000; // 분을 밀리초로 변환
                console.log(`로그인 확인 후 ${LOGIN_WAIT_MINUTES}분 대기합니다...`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
                console.log('대기 완료, 블로그 글쓰기를 시작합니다.');
            }

            // 블로그 글쓰기 페이지로 이동
            console.log(`블로그 글쓰기 페이지로 이동합니다... (블로그명: ${BLOG_ID})`);
            await new Promise((resolve) => setTimeout(resolve, 2000)); // 잠시 대기
            await page.goto(`https://blog.naver.com/${BLOG_ID}?Redirect=Write&`, {
                waitUntil: "networkidle2",
            });
            console.log("블로그 글쓰기 페이지로 이동했습니다.");

            // 글쓰기 작업 수행
            await writePost(page, browser);

        } catch (loginError) {
            console.log("로그인 과정에서 오류가 발생했습니다:", loginError.message);
        }

        // 모든 작업이 완료되었으므로 프로그램을 종료합니다
        console.log("모든 작업이 완료되었습니다.");
        isShuttingDown = true;

        try {
            if (browser.isConnected()) await browser.close();
        } catch (e) { /* 무시 */ }

        process.exit(0);

    } catch (error) {
        console.error("오류 발생:", error.message || error);
        isShuttingDown = true;

        try {
            if (browser.isConnected()) await browser.close();
        } catch (e) { /* 무시 */ }

        process.exit(1);
    } finally {
        isShuttingDown = true;
        try {
            if (browser.isConnected()) await browser.close();
        } catch (e) { /* 무시 */ }

        // 임시 디렉토리 삭제
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
                console.log('임시 프로필 디렉토리가 삭제되었습니다.');
            }
        } catch (error) {
            console.error('임시 디렉토리 삭제 실패:', error.message);
        }

        console.log("프로그램이 종료되었습니다.");
    }
}

// 정리 함수 - imgs 폴더 내용과 result.json 삭제
async function cleanupFiles() {
    try {
        console.log('\n파일 정리를 시작합니다...');

        // 1. imgs 폴더의 모든 파일 삭제
        const imgsDir = path.join(__dirname, 'imgs');
        if (fs.existsSync(imgsDir)) {
            const files = fs.readdirSync(imgsDir);
            for (const file of files) {
                const filePath = path.join(imgsDir, file);
                try {
                    fs.unlinkSync(filePath);
                    console.log(`삭제됨: ${file}`);
                } catch (err) {
                    console.error(`${file} 삭제 실패:`, err.message);
                }
            }
            console.log('imgs 폴더 정리 완료');
        } else {
            console.log('imgs 폴더가 존재하지 않습니다.');
        }

        // 2. result.json 파일 삭제
        const resultPath = path.join(__dirname, 'result.json');
        if (fs.existsSync(resultPath)) {
            fs.unlinkSync(resultPath);
            console.log('result.json 파일 삭제 완료');
        } else {
            console.log('result.json 파일이 존재하지 않습니다.');
        }

        // 3. 루트 폴더의 img_*.png, result_*.txt 파일 삭제
        const allFiles = fs.readdirSync(__dirname);
        const generatedFiles = allFiles.filter(f =>
            (f.startsWith('img_') && f.endsWith('.png')) ||
            (f.startsWith('result_') && f.endsWith('.txt'))
        );
        for (const file of generatedFiles) {
            try {
                fs.unlinkSync(path.join(__dirname, file));
                console.log(`삭제됨: ${file}`);
            } catch (err) {
                console.error(`${file} 삭제 실패:`, err.message);
            }
        }
        if (generatedFiles.length > 0) {
            console.log(`루트 생성 파일 ${generatedFiles.length}개 정리 완료`);
        }

        // 4. 동영상 파일 삭제 (있는 경우)
        const videoFiles = allFiles.filter(file => file.endsWith('_slideshow.mp4'));
        for (const videoFile of videoFiles) {
            const videoPath = path.join(__dirname, videoFile);
            try {
                fs.unlinkSync(videoPath);
                console.log(`동영상 삭제됨: ${videoFile}`);
            } catch (err) {
                console.error(`${videoFile} 삭제 실패:`, err.message);
            }
        }

        console.log('파일 정리가 완료되었습니다.\n');

    } catch (error) {
        console.error('파일 정리 중 오류:', error.message);
    }
}

// 함수 실행
visitNaver();