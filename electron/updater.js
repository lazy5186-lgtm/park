const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 업데이트 서버 주소 — 본인 PC의 공인 IP(또는 도메인)로 바꾸세요.
// 공유기 포트포워딩: 외부 9210 → 내부 192.168.45.210:9210 (등록 완료)
const UPDATE_SERVER_URL = 'http://127.0.0.1:9210';

class Updater {
  constructor(serverUrl = UPDATE_SERVER_URL) {
    this.serverUrl = (serverUrl || '').replace(/\/+$/, '');
  }

  async checkUpdate(currentVersion) {
    try {
      const resp = await axios.post(`${this.serverUrl}/api/check`,
        { version: currentVersion },
        { timeout: 10000 });
      if (resp.data.error) return { hasUpdate: false, error: resp.data.error };
      return resp.data;
    } catch (err) {
      return { hasUpdate: false, error: '서버 연결 실패 — 서버가 켜져 있는지 확인하세요' };
    }
  }

  async downloadUpdate(appPath, onProgress) {
    const mResp = await axios.post(`${this.serverUrl}/api/manifest`, {}, { timeout: 30000 });
    if (mResp.data.error) throw new Error(mResp.data.error);

    const manifest = mResp.data;
    const total = manifest.files.length;

    for (let i = 0; i < total; i++) {
      const file = manifest.files[i];
      if (onProgress) onProgress(i + 1, total, file.path);

      const fResp = await axios.get(`${this.serverUrl}/api/file`, {
        params: { path: file.path },
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      const targetPath = path.join(appPath, file.path);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, Buffer.from(fResp.data));
    }

    return { downloaded: total, version: manifest.version };
  }
}

module.exports = { Updater, UPDATE_SERVER_URL };
