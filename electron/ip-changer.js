const { exec } = require('child_process');
const os = require('os');
const { getPublicIP } = require('./ip-checker');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

function findInterfaceName() {
    const interfaces = os.networkInterfaces();
    const priorityPatterns = [
        /이더넷 2/i,
        /ethernet 2/i,
        /iphone usb/i,
        /이더넷/i,
        /ethernet/i,
        /wi-fi/i,
        /wifi/i,
    ];

    const names = Object.keys(interfaces);
    for (const pattern of priorityPatterns) {
        const match = names.find(n => pattern.test(n));
        if (match) return match;
    }

    for (const [name, addrs] of Object.entries(interfaces)) {
        const hasExternal = addrs.some(a => !a.internal && a.family === 'IPv4');
        if (hasExternal) return name;
    }

    return null;
}

function execCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) reject(new Error(stderr || error.message));
            else resolve(stdout);
        });
    });
}

async function changeIP(interfaceName, logFn) {
    const log = logFn || (() => {});
    const iface = interfaceName || findInterfaceName();

    if (!iface) {
        throw new Error('네트워크 인터페이스를 찾을 수 없습니다.');
    }

    const oldIp = await getPublicIP();
    log(`현재 IP: ${oldIp || '확인 불가'}`);

    log(`인터페이스 "${iface}" 비활성화 중...`);
    try {
        await execCommand(`netsh interface set interface "${iface}" disabled`);
    } catch (e) {
        throw new Error(`인터페이스 비활성화 실패: ${e.message}. 관리자 권한으로 앱을 실행하세요.`);
    }

    log('3초 대기...');
    await delay(3000);

    log(`인터페이스 "${iface}" 활성화 중...`);
    try {
        await execCommand(`netsh interface set interface "${iface}" enabled`);
    } catch (e) {
        throw new Error(`인터페이스 활성화 실패: ${e.message}`);
    }

    log('IP 할당 대기 중 (11초)...');
    await delay(11000);

    const newIp = await getPublicIP();
    log(`변경 전: ${oldIp || '확인 불가'} → 변경 후: ${newIp || '확인 불가'}`);

    if (oldIp && newIp && oldIp === newIp) {
        log('⚠ IP가 변경되지 않았습니다.');
    }

    return newIp;
}

function checkInterface(interfaceName) {
    const interfaces = os.networkInterfaces();
    if (interfaceName && interfaces[interfaceName]) {
        const addrs = interfaces[interfaceName];
        const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
        return { exists: true, name: interfaceName, ip: ipv4 ? ipv4.address : null };
    }
    const detected = findInterfaceName();
    if (detected) {
        const addrs = interfaces[detected];
        const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
        return { exists: true, name: detected, ip: ipv4 ? ipv4.address : null };
    }
    return { exists: false, name: null, ip: null };
}

function listInterfaces() {
    const interfaces = os.networkInterfaces();
    const result = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
        const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
        if (ipv4) {
            result.push({ name, ip: ipv4.address });
        }
    }
    return result;
}

module.exports = { findInterfaceName, changeIP, checkInterface, listInterfaces };
