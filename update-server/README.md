# 업데이트 서버 (N_blog_auto)

인증 없이 매니페스트/파일을 내려주는 단순한 HTTP 서버.
사설망 또는 본인이 통제하는 IP에서만 운영하세요. (라이선스/키 시스템은 추후 추가 예정)

## 서버 실행

```bash
# 기본 포트 9210
node update-server/server.js

# 포트 변경
node update-server/server.js --port 9300
```

종료: `Ctrl+C`. 서버가 꺼져 있으면 클라이언트는 "최신 확인 실패"로 처리하고 그냥 켜진 채로 동작합니다.

---

## 클라이언트 서버 주소 설정

`electron/updater.js` 상단의 `UPDATE_SERVER_URL` 을 본인 IP/도메인으로 바꾸세요:

```js
const UPDATE_SERVER_URL = 'http://1.2.3.4:9210';
```

수정 후 `npm run build` 로 새 설치 파일을 만들면 그 안에 박혀서 배포됩니다.

---

## 업데이트 배포 방법

### 1. 코드 수정 후 빌드

```bash
npm run build
```

빌드 결과물 `dist/win-unpacked/resources/app/` 가 매니페스트 소스가 됩니다.

### 2. 버전 올리기

`update-server/version.json` 수정:

```json
{
  "version": "1.4.2",
  "changelog": "버그 수정"
}
```

> 클라이언트의 `package.json` version 과 비교하므로, 두 군데 모두 같은 값으로 올려야 클라이언트가 새 버전으로 인식합니다.

### 3. 서버 켜기

```bash
node update-server/server.js
```

### 4. 완료

구매자 앱이 시작 시 자동으로 서버에 체크 → 새 버전 있으면 상단 배너 표시 → "다운로드" → "재시작".

---

## 외부 접속 (공유기 포트포워딩)

구매자가 외부에서 접속하려면:

1. 공유기 포트포워딩: 외부 9210 → 내 PC IP:9210
2. 공인 IP 확인 (네이버에 "내 IP")
3. `electron/updater.js` 의 `UPDATE_SERVER_URL` 을 `http://공인IP:9210` 로 설정 후 빌드

IP가 자주 바뀌면 무료 DDNS (duckdns.org, noip.com 등) 사용.

---

## API

- `POST /api/check` body `{version}` → `{hasUpdate, version, changelog}`
- `POST /api/manifest` → `{version, changelog, files: [{path, hash, size}, ...]}`
- `GET  /api/file?path=<relative>` → 파일 바이트

## 파일 구조

```
update-server/
  server.js      ← 서버 본체
  version.json   ← 현재 배포 버전
```

## 주의

- node_modules 변경(의존성 추가/삭제) 시엔 자동 업데이트로 반영 안 됨 — 새 설치 파일 배포 필요
- 매니페스트는 `dist/win-unpacked/resources/app/` 의 모든 파일(node_modules 제외) 포함
- 클라이언트는 받은 파일을 `<install_dir>/resources/app/` 에 직접 덮어씀 → `asar: false` 필수 (이미 설정됨)
- 인증이 없으니 서버 주소가 노출되면 누구나 매니페스트/파일을 받을 수 있음. 외부 공개 시 라이선스 시스템 추가 권장.
