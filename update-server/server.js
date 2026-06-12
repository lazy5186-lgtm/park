/**
 * N_blog_auto — 업데이트 서버 (인증 없음, 사설망용)
 *
 * 사용법:
 *   node server.js                    서버 시작 (기본 포트 9210)
 *   node server.js --port 9300        포트 지정
 *
 * 매니페스트 소스: ../dist/win-unpacked/resources/app/
 *  → npm run build 로 생성됨
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION_PATH = path.join(__dirname, 'version.json');
const DIST_PATH = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app');

function loadVersion() {
  try { return JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8')); }
  catch { return { version: '1.0.0', changelog: '' }; }
}

// ── 매니페스트 ──

function walkDir(dir, cb, base = dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // node_modules 는 매니페스트에서 제외 (용량 큼, 의존성 변경 시 재설치 필요)
      if (entry.name === 'node_modules') continue;
      walkDir(full, cb, base);
    } else {
      cb(full, path.relative(base, full));
    }
  }
}

function generateManifest() {
  const ver = loadVersion();
  const files = [];
  walkDir(DIST_PATH, (fullPath, relPath) => {
    const hash = crypto.createHash('md5').update(fs.readFileSync(fullPath)).digest('hex');
    files.push({ path: relPath.replace(/\\/g, '/'), hash, size: fs.statSync(fullPath).size });
  });
  return { version: ver.version, changelog: ver.changelog, files };
}

// ── HTTP 헬퍼 ──

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('ko-KR')}] ${msg}`);
}

// ── 서버 ──

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    // ── 업데이트 체크 ──
    if (route === '/api/check' && req.method === 'POST') {
      const { version } = await parseBody(req);
      const ver = loadVersion();
      const hasUpdate = ver.version !== version;
      log(`[CHECK] v${version || '?'} -> ${hasUpdate ? 'v' + ver.version + ' 있음' : '최신'}`);
      return json(res, { hasUpdate, version: ver.version, changelog: ver.changelog });
    }

    // ── 매니페스트 ──
    if (route === '/api/manifest' && req.method === 'POST') {
      if (!fs.existsSync(DIST_PATH)) {
        return json(res, { error: '빌드 결과물이 없습니다 (npm run build 필요)' }, 503);
      }
      const manifest = generateManifest();
      log(`[MANIFEST] ${manifest.files.length}개 파일`);
      return json(res, manifest);
    }

    // ── 파일 다운로드 ──
    if (route === '/api/file' && req.method === 'GET') {
      const filePath = url.searchParams.get('path');
      const fullPath = path.resolve(DIST_PATH, filePath || '');
      if (!fullPath.startsWith(path.resolve(DIST_PATH))) {
        return json(res, { error: '잘못된 경로' }, 400);
      }
      if (!fs.existsSync(fullPath)) {
        return json(res, { error: '파일 없음' }, 404);
      }

      const content = fs.readFileSync(fullPath);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': content.length });
      return res.end(content);
    }

    json(res, { error: 'Not Found' }, 404);
  } catch (err) {
    log(`[ERROR] ${err.message}`);
    json(res, { error: '서버 오류' }, 500);
  }
});

// ── 서버 시작 ──

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = (portIdx !== -1 && args[portIdx + 1]) ? parseInt(args[portIdx + 1]) : 9210;

server.listen(port, () => {
  const ver = loadVersion();
  const distExists = fs.existsSync(DIST_PATH);
  console.log('');
  console.log('  ======================================');
  console.log('   N_blog_auto - 업데이트 서버');
  console.log('  ======================================');
  console.log(`   포트: ${port}`);
  console.log(`   버전: ${ver.version}`);
  console.log(`   배포본: ${distExists ? 'OK' : '없음 (npm run build 필요)'}`);
  console.log('  ======================================');
  console.log('');
});
