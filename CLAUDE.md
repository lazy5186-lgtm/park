# N_blog_auto (PARK_SAMPLE)

네이버 블로그 자동 포스팅 Electron 데스크톱 앱. 현재 버전 **v1.5.0**.

## 스택
- Electron 35 + Node.js (CommonJS)
- puppeteer-core (시스템 Chrome 사용, `electron/main.js`의 `findChromePath`)
- Gemini (`@google/genai`, `@google/generative-ai`) — 글/이미지 생성
- sharp — AI 탐지 우회 이미지 가공
- **이중 업데이트 시스템 (v1.4.1+)**:
  - electron-updater + GitHub Release (`lazy5186-lgtm/park`) — 기존 사용자 마이그레이션용 (제거 예정이었으나 보류)
  - 자체 업데이트 서버 (`update-server/server.js`, 포트 9210, 인증 없음) + axios — 매니페스트 기반 파일 교체

## 엔트리 & 주요 파일
| 파일 | 역할 |
|---|---|
| `electron/main.js` | 앱 부트 + IPC 핸들러 + 이중 업데이트(electron-updater + 자체 서버) + ADB 자동 설치 |
| `electron/preload.js` | contextBridge IPC 노출 |
| `electron/renderer/{index.html,app.js,styles.css}` | UI (대시보드/포스팅/키워드/기록 + 활성화 오버레이) |
| `electron/config-manager.js` | `config.json`, 키워드, 네이버 계정·쿠키 관리 |
| `electron/process-runner.js` | 생성/포스팅 스크립트 자식 프로세스 실행 |
| `electron/adb-installer.js`, `adb-helper.js` | ADB 자동 설치·호출 + USB 테더링 ON/OFF 토글(`svc usb setFunctions rndis`, v1.5.0+) |
| `electron/updater.js` | 매니페스트 기반 파일 교체 업데이트 클라이언트 (서버 URL은 파일 상단 `UPDATE_SERVER_URL` 상수) |
| `update-server/{server.js,version.json}` | 개발자 측 업데이트 서버 (포트 9210, `dist/win-unpacked/resources/app/` 매니페스트 소스, 인증 없음) |
| `electron/ip-changer.js`, `ip-checker.js` | 모바일 IP 변경(ADB 이용) |
| `generate_article.js` | Gemini로 글+이미지 생성, 이미지 탐지 우회 처리 |
| `3.post.js` | puppeteer로 네이버 로그인 → 작성 → 발행 (2,890줄, 실전 로직) |
| `lib/*.js` | 에디터 조작 모듈 (이미지/영상/정렬/폰트/인용/스티커/슬라이드 등) |
| `prompt/profiles/<id>/{info,img}_Prompt.md` | **활성 프로필 시드** — 첫 실행 시 USER_DATA_DIR로 복사. `1_loan`(대출) + `_template`(빈 템플릿) 번들 |
| `prompt/prompt/{info,img}_Prompt.md` | **fallback 잔재** — `ACTIVE_PROFILE_DIR` env가 없을 때만 사용. v1.4.0부터 실사용 X, 정리 예정 |

> `ipc-handlers.js`(루트)는 **현재 쓰이지 않는 잔재** — `./data/store`, `./core/*` 등 존재하지 않는 경로 참조. 실제 IPC는 `electron/main.js`에 정의돼 있음.

## 런타임 데이터 (모두 `USER_DATA_DIR = %APPDATA%/N_blog_auto/`)
- `config.json` — Gemini 키·모델·오버레이(카카오/전화)·예약 발행 설정 + `activeProfileId`(v1.4.0+)
- `profiles/<id>/{info_Prompt.md, img_Prompt.md, profile.json}` — 사용자 편집 가능한 프로필 (v1.4.0+, 최대 3개)
- `naver_accounts.json` — 계정 목록 (id/pw)
- `cookies/<id>_cookies.json` — 계정별 쿠키
- `image_prompt_history.json` — 이미지 프롬프트 히스토리 (전역)
- `profiles/<id>/{custom_keywords.json, removed_keywords.json, used_keywords.json, keyword_history.json}` — **키워드는 v1.5.0부터 프로필별**. 키워드 탭에서 프로필 전환 시 키워드 목록·사이클·중복방지 기록이 함께 전환. 글 생성(`generate_article.js`)도 `ACTIVE_PROFILE_DIR`에서 읽음. (구 전역 키워드 파일은 첫 실행 시 활성 프로필로 자동 마이그레이션 → 원본은 `.migrated` 백업)
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

## 릴리스 (자체 업데이트 서버, v1.4.1+)
1. **첫 셋업 한 번만**: `electron/updater.js` 의 `UPDATE_SERVER_URL` 을 본인 IP(또는 도메인)로 설정
2. 코드 수정 후 `package.json` version 올리고 `npm run build` (NSIS 설치 파일 + `dist/win-unpacked/` 생성)
3. `update-server/version.json` 의 `version`, `changelog` 갱신 (이게 클라이언트가 비교하는 버전)
4. `node update-server/server.js` 로 서버 켜기 (기본 포트 9210)
5. 클라이언트가 시작 시 자동으로 새 버전 감지 → 배너에서 "다운로드" → "재시작"으로 적용
6. 자세한 운영은 `update-server/README.md` 참고

> 매니페스트 소스는 `dist/win-unpacked/resources/app/` (build 결과물). `node_modules`는 매니페스트에서 제외 — 의존성 변경 시 재배포 필요.
> 인증 없음 — 사설망 또는 통제된 IP 한정. 외부 공개 시 라이선스 시스템 추가 필요.

- 최근 릴리스 흐름은 `git log` 참고 (v1.3.0 발행 URL 캡처 → v1.3.1 이미지 텍스트 방지 → v1.3.2 키워드 토글 → v1.3.3 mainFrame 타임아웃 → v1.4.0 프롬프트 프로필 시스템 + 쿠키 세션 표시 → v1.4.1 자체 업데이트 서버 → v1.5.0 USB 테더링 토글 + 프로필별 키워드)

## 주의
- `config.json`에 실제 Gemini API 키가 커밋돼 있음 — 키 유출 주의, 교체 시 앱 재시작 필요
- `3.post.js`의 `LOGIN_WAIT_MINUTES`, `POST_COMPLETION_WAIT_MINUTES`가 개발용 극소값(`0.0001`)으로 박혀 있음. 실전 배포 시 조정 필요한지 확인
- Windows 전용 (ADB 자동 설치, chrome 경로, NSIS 빌드 모두 Win 기준)
- puppeteer-core는 번들되지 않고 **시스템 Chrome** 사용 — 사용자 PC에 Chrome 필수

## 참고: gitsample/Mato_Helper 비교 (2026-04-21 조사 / 2026-04-29 적용 → 2026-05-11 롤백)
같은 디렉터리 상위의 `../gitsample/`은 Python/PyInstaller 기반의 타 블로그 생성 도구. **소스 없음(.pyd 바이너리만)**. Blogger API 드래프트 중심 + 다국어(KR/EN/JA/TH/ZH) + 고정 SEO HTML 템플릿. 실제 네이버 자동 포스팅 로직은 없음 — 우리 프로젝트가 이 부분에서 우위.

**Mato 통합 시도 → 롤백**: 2026-04-29 v1.4.0에서 BASE+LANG 분리 구조의 핵심 규칙(도입부 공식, 금지 어미, 수치 의무화, 메타 가드, 블랙리스트)을 `1_loan/info_Prompt.md`의 `[Hook & Style Rules]` + `[Anti-Leak / Meta Guard]` 블록으로 통합. 2026-05-11에 두 블록 모두 제거(시드 + USER_DATA_DIR 사본)하여 v1.2.2 원본 상태로 환원.
