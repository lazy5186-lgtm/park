# N_blog_auto (PARK_SAMPLE)

네이버 블로그 자동 포스팅 Electron 데스크톱 앱. 현재 버전 **v1.3.2**.

## 스택
- Electron 35 + Node.js (CommonJS)
- puppeteer-core (시스템 Chrome 사용, `electron/main.js`의 `findChromePath`)
- Gemini (`@google/genai`, `@google/generative-ai`) — 글/이미지 생성
- sharp — AI 탐지 우회 이미지 가공
- electron-updater + GitHub Release (`lazy5186-lgtm/park`)

## 엔트리 & 주요 파일
| 파일 | 역할 |
|---|---|
| `electron/main.js` | 앱 부트 + IPC 핸들러 + 자동 업데이트 + ADB 자동 설치 |
| `electron/preload.js` | contextBridge IPC 노출 |
| `electron/renderer/{index.html,app.js,styles.css}` | UI (대시보드/포스팅/키워드/기록) |
| `electron/config-manager.js` | `config.json`, 키워드, 네이버 계정·쿠키 관리 |
| `electron/process-runner.js` | 생성/포스팅 스크립트 자식 프로세스 실행 |
| `electron/adb-installer.js`, `adb-helper.js` | ADB 자동 설치·호출 |
| `electron/ip-changer.js`, `ip-checker.js` | 모바일 IP 변경(ADB 이용) |
| `generate_article.js` | Gemini로 글+이미지 생성, 이미지 탐지 우회 처리 |
| `3.post.js` | puppeteer로 네이버 로그인 → 작성 → 발행 (2,890줄, 실전 로직) |
| `lib/*.js` | 에디터 조작 모듈 (이미지/영상/정렬/폰트/인용/스티커/슬라이드 등) |
| `prompt/prompt/info_Prompt.md` | 글 생성 프롬프트 (현재: 금융 대출 컨설턴트 톤) |
| `prompt/prompt/img_Prompt.md` | 이미지 생성 프롬프트 (텍스트 완전 금지 규칙) |

> `ipc-handlers.js`(루트)는 **현재 쓰이지 않는 잔재** — `./data/store`, `./core/*` 등 존재하지 않는 경로 참조. 실제 IPC는 `electron/main.js`에 정의돼 있음.

## 런타임 데이터
- `config.json` — Gemini 키·모델·오버레이(카카오/전화)·예약 발행 설정
- `naver_accounts.json` — 계정 목록 (id/pw)
- `cookies/<id>_cookies.json` — 계정별 쿠키
- `keyword_history.json`, `image_prompt_history.json`, `used_keywords.json` — 히스토리
- `post_dashboard/post_id.txt`, `selected_account.txt` — 세션 상태
- `posted/` — 발행 완료 결과
- `setting.txt` — **구 구조 잔재** (globping 카페용 env). 현재 코드 경로에서는 참조 안 됨.

## 빌드 & 실행
```bash
npm start              # 개발 실행 (electron .)
npm run build          # Windows NSIS 설치 파일 (dist/)
```
빌드 산출물: `N_blog_auto-Setup-<version>.exe`. `asar: false`로 내용 노출됨.

## 포스팅 파이프라인
1. UI에서 `script:post` 호출 → `electron/main.js`
2. `result.json` 유효성 검사 (`isResultValid`) — `gemini.h1` 또는 `sections` 존재 시 유효
3. 없으면 `generate_article.js` 실행 → Gemini로 글/이미지 생성, 이미지 6단 가공(노이즈·색상변조·회전크롭·JPEG 재압축·샤프닝·비네팅)
4. 5초 후 `3.post.js` 실행 → puppeteer로 네이버 에디터 조작, 발행 URL 캡처
5. `autoAll`: 선택 계정 순차 실행 (IP 변경 → 글 생성 → 포스팅 반복)

## 릴리스
- `package.json`의 `version` 올린 뒤 `npm run build`
- GitHub Release 업로드 시 `electron-updater`가 클라이언트에서 자동 감지
- 최근 릴리스 흐름은 `git log` 참고 (v1.3.0 발행 URL 캡처 → v1.3.1 이미지 텍스트 방지 → v1.3.2 키워드 토글)

## 주의
- `config.json`에 실제 Gemini API 키가 커밋돼 있음 — 키 유출 주의, 교체 시 앱 재시작 필요
- `3.post.js`의 `LOGIN_WAIT_MINUTES`, `POST_COMPLETION_WAIT_MINUTES`가 개발용 극소값(`0.0001`)으로 박혀 있음. 실전 배포 시 조정 필요한지 확인
- Windows 전용 (ADB 자동 설치, chrome 경로, NSIS 빌드 모두 Win 기준)
- puppeteer-core는 번들되지 않고 **시스템 Chrome** 사용 — 사용자 PC에 Chrome 필수

## 참고: gitsample/Mato_Helper 비교 (2026-04-21 조사)
같은 디렉터리 상위의 `../gitsample/`은 Python/PyInstaller 기반의 타 블로그 생성 도구. **소스 없음(.pyd 바이너리만)**. Blogger API 드래프트 중심 + 다국어(KR/EN/JA/TH/ZH) + 고정 SEO HTML 템플릿. 실제 네이버 자동 포스팅 로직은 없음 — 우리 프로젝트가 이 부분에서 우위. 참고할 만한 포인트는 **프롬프트 BASE/언어 분리 구조**와 **SEO HTML 블록 템플릿**.
