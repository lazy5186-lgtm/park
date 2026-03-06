const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const { handleAccountProtection } = require('./account-protection-module');

// Chrome 실행 파일 경로 찾기 함수
function findChromePath() {
  const platform = os.platform();
  let chromePaths = [];

  if (platform === 'win32') {
    chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
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
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    ];
  }

  for (const chromePath of chromePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`Chrome 경로를 찾았습니다: ${chromePath}`);
      return chromePath;
    }
  }

  console.log('Chrome을 찾을 수 없습니다. 기본 설정을 사용합니다.');
  return null;
}

// 쿠키 파일 경로 가져오기
function getCookieFilePath(userId) {
  const cookiesDir = path.join(path.dirname(__dirname), 'cookies');
  if (!fs.existsSync(cookiesDir)) {
    fs.mkdirSync(cookiesDir);
  }
  return path.join(cookiesDir, `${userId}_cookies.json`);
}

// 임시 브라우저 프로필 디렉토리 생성
function createTempProfilePath() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'naver-login-'));
}

// 랜덤 유저 에이전트 생성
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ];
  
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// 로컬 스토리지 데이터 추출
async function getLocalStorage(page) {
  try {
    const localStorage = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        items[key] = window.localStorage.getItem(key);
      }
      return items;
    });
    return localStorage;
  } catch (error) {
    console.error('로컬 스토리지 추출 오류:', error);
    return {};
  }
}

// 세션 스토리지 데이터 추출
async function getSessionStorage(page) {
  try {
    const sessionStorage = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        items[key] = window.sessionStorage.getItem(key);
      }
      return items;
    });
    return sessionStorage;
  } catch (error) {
    console.error('세션 스토리지 추출 오류:', error);
    return {};
  }
}

// 로컬 스토리지 데이터 복원
async function setLocalStorage(page, data) {
  try {
    await page.evaluate((storageData) => {
      Object.keys(storageData).forEach(key => {
        window.localStorage.setItem(key, storageData[key]);
      });
    }, data);
    console.log('로컬 스토리지 복원 완료');
  } catch (error) {
    console.error('로컬 스토리지 복원 오류:', error);
  }
}

// 세션 스토리지 데이터 복원
async function setSessionStorage(page, data) {
  try {
    await page.evaluate((storageData) => {
      Object.keys(storageData).forEach(key => {
        window.sessionStorage.setItem(key, storageData[key]);
      });
    }, data);
    console.log('세션 스토리지 복원 완료');
  } catch (error) {
    console.error('세션 스토리지 복원 오류:', error);
  }
}

// 블로그 ID 추출 함수
async function extractBlogId(cookies) {
  try {
    const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

    const response = await axios.get('https://section.blog.naver.com/ajax/BlogUserInfo.naver', {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'ko,en-US;q=0.9,en;q=0.8',
        'cache-control': 'no-cache',
        'cookie': cookieString,
        'pragma': 'no-cache',
        'referer': 'https://section.blog.naver.com/BlogHome.naver',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
      }
    });

    let responseData = response.data;
    if (typeof responseData === 'string') {
      responseData = responseData.replace(/^\)\]\}',\n/, '');
      responseData = JSON.parse(responseData);
    }

    if (responseData.result) {
      const { hasOpenedBlog, domainIdOrUserId, blogNo } = responseData.result;

      if (hasOpenedBlog === true && domainIdOrUserId) {
        console.log(`✅ 블로그 ID: ${domainIdOrUserId}`);
        return domainIdOrUserId;
      } else if (hasOpenedBlog === false) {
        console.log(`❌ 블로그 미개설 (userId: ${domainIdOrUserId})`);
        return null;
      }
    }

    console.log('❌ 블로그 ID를 찾을 수 없습니다.');
    return null;
  } catch (error) {
    console.error('❌ 블로그 ID 추출 오류:', error.message);
    return null;
  }
}

// 네이버 쇼핑 커넥트 space-id 추출
async function extractSpaceId(page) {
  try {
    await page.goto('https://brandconnect.naver.com/', { 
      waitUntil: 'networkidle0', 
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const currentUrl = page.url();
    console.log('현재 URL:', currentUrl);
    
    const match = currentUrl.match(/brandconnect\.naver\.com\/(\d+)\//)
    
    if (match && match[1]) {
      console.log(`Space ID 추출 성공: ${match[1]}`);
      return match[1];
    }
    
    const spaceId = await page.evaluate(() => {
      if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.space) {
        return window.__INITIAL_STATE__.space.id;
      }
      const scripts = document.querySelectorAll('script');
      for (let script of scripts) {
        const content = script.textContent;
        const match = content.match(/"spaceId":"(\d+)"|spaceId["']?:\s*["'](\d+)["']/);
        if (match) {
          return match[1] || match[2];
        }
      }
      return null;
    });
    
    if (spaceId) {
      console.log(`Space ID 추출 성공: ${spaceId}`);
      return spaceId;
    }
    
    console.log('Space ID를 찾을 수 없습니다.');
    return null;
  } catch (error) {
    console.error('Space ID 추출 오류:', error);
    return null;
  }
}

// JSON 파일에 쿠키와 스토리지 데이터 저장
async function saveLoginData(page, userId) {
  try {
    await page.goto('https://www.naver.com', { waitUntil: 'networkidle0', timeout: 30000 });
    
    const cookies = await page.cookies();
    const localStorage = await getLocalStorage(page);
    const sessionStorage = await getSessionStorage(page);
    const spaceId = await extractSpaceId(page);
    const blogId = await extractBlogId(cookies);
    
    // Space ID와 Blog ID를 cookies JSON 파일에 저장
    if (spaceId) {
      console.log(`Space ID (${spaceId})를 cookies JSON에 저장했습니다.`);
    }
    if (blogId) {
      console.log(`Blog ID (${blogId})를 cookies JSON에 저장했습니다.`);
    }
    
    const loginData = {
      cookies: cookies,
      localStorage: localStorage,
      sessionStorage: sessionStorage,
      userAgent: await page.evaluate(() => navigator.userAgent),
      spaceId: spaceId,
      blogId: blogId,
      savedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(getCookieFilePath(userId), JSON.stringify(loginData, null, 2));
    console.log(`로그인 데이터가 cookies/${userId}_cookies.json 파일에 저장되었습니다.`);
    return true;
  } catch (error) {
    console.error('로그인 데이터 저장 오류:', error);
    return false;
  }
}

// JSON 파일에서 쿠키와 스토리지 데이터 불러오기
async function loadLoginData(page, userId) {
  const cookieFilePath = getCookieFilePath(userId);
  if (fs.existsSync(cookieFilePath)) {
    try {
      const dataString = fs.readFileSync(cookieFilePath);
      const loginData = JSON.parse(dataString);
      
      // 구버전 호환성 체크
      if (Array.isArray(loginData)) {
        await page.setCookie(...loginData);
        console.log("JSON 파일에서 쿠키를 불러왔습니다. (구버전)");
        return true;
      }
      
      // 신버전 데이터 처리
      if (loginData.cookies) {
        await page.setCookie(...loginData.cookies);
      }
      
      await page.goto('https://www.naver.com', { waitUntil: 'networkidle0', timeout: 30000 });
      
      if (loginData.localStorage) {
        await setLocalStorage(page, loginData.localStorage);
      }
      
      if (loginData.sessionStorage) {
        await setSessionStorage(page, loginData.sessionStorage);
      }
      
      if (loginData.userAgent) {
        await page.setUserAgent(loginData.userAgent);
      }
      
      console.log("JSON 파일에서 로그인 데이터를 불러왔습니다.");
      return true;
    } catch (error) {
      console.error("로그인 데이터 로드 오류:", error);
      return false;
    }
  }
  return false;
}

// 로그인 상태 확인 (개선된 버전)
async function checkLoginStatus(page) {
  try {
    await page.goto("https://www.naver.com", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    console.log('🔍 로그인 상태 정밀 확인 중...');

    // 1. 로그인 버튼 존재 여부 확인
    const loginButtonExists = await page.evaluate(() => {
      const loginSelectors = [
        '.MyView-module__my_login___tOTgr', // 메인 로그인 버튼
        'a[href*="nid.naver.com/nidlogin.login"]', // 로그인 링크
        '.link_login', // 로그인 링크 클래스
        '.gnb_login', // GNB 로그인
      ];
      
      for (const selector of loginSelectors) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            // 로그인 텍스트가 포함된 요소인지 확인
            const text = element.textContent || element.innerText || '';
            if (text.includes('로그인') || element.href?.includes('nidlogin')) {
              return true;
            }
          }
        } catch (e) {
          // 선택자 오류 무시
        }
      }
      return false;
    });

    // 2. 프로필/마이 영역 존재 여부 확인
    const profileExists = await page.evaluate(() => {
      const profileSelectors = [
        '.MyView-module__my_area___j_4_D', // 마이 영역
        '.MyView-module__profile_area___2wQg4', // 프로필 영역
        '.MyView-module__user_info___1wWqg', // 사용자 정보
        '.gnb_my', // 기존 GNB 마이 영역
        '.my_area', // 마이 영역 일반
        '[class*="my_area"]', // 마이 영역 포함 클래스
        '[class*="profile"]', // 프로필 포함 클래스
      ];
      
      for (const selector of profileSelectors) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            return true;
          }
        } catch (e) {
          // 선택자 오류 무시
        }
      }
      return false;
    });

    // 3. 로그인 상태 판단 - 로그인 버튼이 없으면 로그인된 것
    const isLoggedIn = !loginButtonExists;

    console.log(`📊 로그인 상태 분석:`);
    console.log(`   - 로그인 버튼 존재: ${loginButtonExists ? '예' : '아니오'}`);
    console.log(`   - 최종 판단: ${isLoggedIn ? '로그인됨' : '로그인 필요'}`);

    if (isLoggedIn) {
      console.log("✅ 이미 로그인된 상태입니다.");
      return true;
    } else {
      console.log("❌ 로그인이 필요합니다.");
      return false;
    }
  } catch (error) {
    console.error("로그인 상태 확인 중 에러:", error);
    return false;
  }
}

// 계정 정지/차단 상태 확인 함수
async function checkAccountSuspension(page, userId) {
  try {
    // 2초 대기 (정지 메시지가 나타날 시간)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const currentUrl = page.url();
    
    let suspensionFound = false;
    let suspensionReason = '';
    
    // 페이지 텍스트에서 정지 메시지 확인
    try {
      const pageText = await page.evaluate(() => document.body.textContent || document.body.innerText || '');
      
      if (pageText && checkSuspensionText(pageText)) {
          suspensionFound = true;
          
          // 관련 문구만 추출
          const suspensionPhrases = [
            '정지된 계정', '차단된 계정', '일시정지', '이용정지',
            '계정이 정지', '계정이 차단', '서비스 이용이 제한',
            '약관 위반', '부정 이용', '스팸 활동', '임시정지',
            '영구정지', '영구차단', '계정 잠금', '사용 중지',
            '접근이 차단', '이용이 차단', '이용이 정지'
          ];
          
          for (const phrase of suspensionPhrases) {
            if (pageText.includes(phrase)) {
              const startIndex = Math.max(0, pageText.indexOf(phrase) - 50);
              const endIndex = Math.min(pageText.length, pageText.indexOf(phrase) + 100);
              suspensionReason = pageText.substring(startIndex, endIndex).trim();
              console.log(`🚫 정지 키워드 "${phrase}" 발견!`);
              break;
            }
          }
          
          if (!suspensionReason) {
            suspensionReason = '계정 정지/차단 상태 (상세 내용 확인 필요)';
          }
          
          console.log(`📋 페이지에서 정지 메시지 확인: ${suspensionReason.substring(0, 100)}`);
        }
    } catch (e) {
      console.log('페이지 텍스트 확인 중 오류:', e.message);
    }
    
    // URL 패턴으로 확인
    
    // URL 패턴으로 확인
    if (!suspensionFound) {
      const currentUrl = page.url();
      if (currentUrl.includes('block') || currentUrl.includes('suspend') || 
          currentUrl.includes('error') || currentUrl.includes('restriction')) {
        suspensionFound = true;
        suspensionReason = `URL에서 정지 상태 감지: ${currentUrl}`;
        console.log(`🚫 URL에서 정지 상태 감지`);
      }
    }
    
    return {
      isSuspended: suspensionFound,
      reason: suspensionReason,
      accountId: userId
    };
    
  } catch (error) {
    console.log('계정 정지 확인 중 오류:', error.message);
    return { isSuspended: false, reason: '', accountId: userId };
  }
}

// 정지/차단 관련 텍스트 패턴 확인
function checkSuspensionText(text) {
  if (!text) return false;
  
  const suspensionPatterns = [
    '정지된 계정',
    '차단된 계정',
    '일시정지',
    '이용정지',
    '계정이 정지',
    '계정이 차단',
    '서비스 이용이 제한',
    '약관 위반으로 인한',
    '부정 이용이 감지',
    '스팸 활동이 감지',
    '계정이 잠금',
    '계정이 블록',
    '계정 사용이 제한',
    '로그인이 제한',
    '일시적으로 사용이 제한',
    '규정 위반',
    '이용약관 위반',
    '커뮤니티 가이드라인 위반',
  ];
  
  const lowerText = text.toLowerCase();
  const patterns = suspensionPatterns.concat([
    'account suspended',
    'account blocked',
    'account locked',
    'account restricted',
    'temporarily suspended',
    'access denied',
    'service restricted',
  ]);
  
  return patterns.some(pattern => 
    text.includes(pattern) || lowerText.includes(pattern.toLowerCase())
  );
}

// 실제 로그인 수행
async function performLogin(page, userId, userPw) {
  try {
    await page.goto("https://nid.naver.com/nidlogin.login", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    console.log("네이버 로그인 페이지 접속 완료");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await page.evaluate(
      (id) => {
        document.querySelector("#id").value = id;
      },
      userId
    );
    console.log("아이디 입력 완료");
    
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    await page.evaluate(
      (pw) => {
        document.querySelector("#pw").value = pw;
      },
      userPw
    );
    console.log("비밀번호 입력 완료");

    const keepLoginCheckbox = await page.$("#keep");
    const isChecked = await page.evaluate(
      (el) => el.checked,
      keepLoginCheckbox
    );
    if (!isChecked) {
      await keepLoginCheckbox.click();
      console.log("로그인 상태 유지 체크 완료");
    }

    const ipSecurityCheckbox = await page.$("#switch");
    const isIpSecurityOn = await page.evaluate(
      (el) => el.value === "on",
      ipSecurityCheckbox
    );
    if (isIpSecurityOn) {
      await ipSecurityCheckbox.click();
      console.log("IP 보안 OFF 설정 완료");
    }

    await page.click(".btn_login");
    console.log("로그인 버튼 클릭 완료");

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 1. 일반적인 로그인 에러 확인
    const errorElement = await page.$('#err_common .error_message');
    if (errorElement) {
      const errorMessage = await page.evaluate(el => el.textContent, errorElement);
      console.log("로그인 에러 발생:", errorMessage);
      return false;
    }

    // 2. 계정 보호 조치 확인 (보호조치 해제 페이지 감지)
    console.log("🔍 계정 보호 조치 확인 중...");
    const currentUrl = page.url();
    const pageText = await page.evaluate(() => document.body.textContent || document.body.innerText || '');
    
    if (currentUrl.includes('idSafetyRelease') || 
        pageText.includes('회원님의 아이디를 보호하고 있습니다') ||
        pageText.includes('개인정보보호 및 도용으로 인한 피해를 예방하기 위해')) {
      console.log(`🚨 계정 보호 조치 감지됨: ${userId}`);
      
      // 보호된 계정 처리 (account-protection-module 사용)
      const { moveProtectedAccount } = require('./account-protection-module');
      const moveResult = moveProtectedAccount(userId, '보호조치');
      
      if (moveResult.success) {
        console.log(`📝 보호된 계정 ${userId}가 check_id.txt로 이동되었습니다.`);
      }
      
      return false;
    }
    
    // 3. 계정 정지/차단 메시지 확인
    const suspensionInfo = await checkAccountSuspension(page, userId);
    
    if (suspensionInfo.isSuspended) {
      console.log(`🚫 계정 정지 감지: ${suspensionInfo.reason}`);
      
      // 정지된 계정 처리 (account-protection-module 사용)
      const { moveProtectedAccount } = require('./account-protection-module');
      const suspensionReason = `계정정지: ${suspensionInfo.reason}`;
      const moveResult = moveProtectedAccount(userId, suspensionReason);
      
      if (moveResult.success) {
        console.log(`📝 정지된 계정 ${userId}가 check_id.txt로 이동되었습니다.`);
      }
      
      return false;
    }

    // 3. 로그인 성공 시 데이터 저장
    await saveLoginData(page, userId);
    return true;
  } catch (error) {
    console.error("로그인 중 에러 발생:", error);
    return false;
  }
}

// 로그인 모듈 메인 함수
async function login(userId, userPw) {
  const userDataDir = createTempProfilePath();
  console.log(`임시 브라우저 프로필 경로: ${userDataDir}`);

  const chromePath = findChromePath();
  const randomUserAgent = getRandomUserAgent();
  console.log(`사용할 User Agent: ${randomUserAgent}`);
  
  const browserOptions = {
    headless: false,
    ignoreHTTPSErrors: true,
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
      "--disable-automation",
      "--disable-blink-features=AutomationControlled",
      "--ignore-certificate-errors",
      "--start-maximized",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--no-first-run",
      "--disable-default-apps",
      "--disable-popup-blocking",
      "--disable-translate",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-ipc-flooding-protection",
      "--remote-debugging-port=0",
      `--user-agent=${randomUserAgent}`,
    ],
    userDataDir: userDataDir,
  };

  if (chromePath) {
    browserOptions.executablePath = chromePath;
  }

  let browser;
  try {
    console.log('브라우저 실행 중...');
    browser = await puppeteer.launch(browserOptions);
    console.log('브라우저 실행 완료');
    
    // 기본 페이지 처리를 더 안전하게
    const pages = await browser.pages();
    console.log(`기본 페이지 수: ${pages.length}`);
    
    let page;
    if (pages.length > 0) {
      page = pages[0];
      console.log('기존 페이지 사용');
    } else {
      console.log('새 페이지 생성 시도...');
      page = await browser.newPage();
      console.log('새 페이지 생성 완료');
    }
    
    // 브라우저 설정 및 랜덤 유저 에이전트 설정
    try {
      await page.setUserAgent(randomUserAgent);
      console.log('User Agent 설정 완료');
      
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => false,
        });
      });
      console.log('자동화 탐지 우회 설정 완료');
    } catch (setupError) {
      console.log('페이지 설정 중 오류:', setupError.message);
    }

    let isLoggedIn = false;
    let needsSpaceId = false;
    
    // 1. 저장된 쿠키로 로그인 시도
    const cookiesLoaded = await loadLoginData(page, userId);
    if (cookiesLoaded) {
      isLoggedIn = await checkLoginStatus(page);
      if (isLoggedIn) {
        console.log("저장된 쿠키로 로그인 성공");
        
        // Space ID와 Blog ID가 있는지 확인
        const cookieFilePath = getCookieFilePath(userId);
        if (fs.existsSync(cookieFilePath)) {
          const loginData = JSON.parse(fs.readFileSync(cookieFilePath, 'utf8'));
          if (!loginData.spaceId || !loginData.blogId) {
            console.log("Space ID 또는 Blog ID가 없습니다. 추출을 시도합니다...");
            needsSpaceId = true;
          }
        }
      } else {
        console.log("저장된 쿠키로 로그인 실패");
      }
    }

    // 2. 새로운 로그인 수행
    if (!isLoggedIn) {
      console.log("새로운 로그인 시도");
      isLoggedIn = await performLogin(page, userId, userPw);
    }
    
    // 3. 로그인은 되었지만 Space ID가 필요한 경우
    if (isLoggedIn && needsSpaceId) {
      console.log("Space ID 추출을 위해 데이터를 저장합니다...");
      await saveLoginData(page, userId);
    }

    // 브라우저 안전하게 종료
    try {
      await browser.close();
      console.log('브라우저 종료 완료');
    } catch (closeError) {
      console.error('브라우저 종료 중 오류:', closeError.message);
    }
    
    // 잠시 대기 후 임시 프로필 디렉토리 정리
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
        console.log('임시 브라우저 프로필이 정리되었습니다.');
      }
    } catch (error) {
      console.error('임시 프로필 삭제 실패:', error.message);
    }
    
    return isLoggedIn;
    
  } catch (error) {
    console.error("로그인 모듈 에러:", error);
    
    // 브라우저 안전하게 종료
    if (browser && browser.isConnected()) {
      try {
        await browser.close();
        console.log('에러 발생 시 브라우저 종료 완료');
      } catch (closeError) {
        console.error('브라우저 종료 중 오류:', closeError.message);
      }
    }
    
    // 잠시 대기 후 에러 발생 시에도 임시 프로필 정리
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
        console.log('임시 브라우저 프로필이 정리되었습니다.');
      }
    } catch (cleanupError) {
      console.error('임시 프로필 삭제 실패:', cleanupError.message);
    }
    
    return false;
  }
}

module.exports = {
  login,
  loadLoginData,
  saveLoginData,
  checkLoginStatus,
  getCookieFilePath,
  createTempProfilePath,
  getRandomUserAgent,
  extractBlogId
};