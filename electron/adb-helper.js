const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

function getAdbPath() {
    // 1. lib 폴더의 adb.exe
    const libAdb = path.join(__dirname, '..', 'lib', 'adb.exe');
    if (fs.existsSync(libAdb)) return libAdb;

    // 2. electron 폴더의 adb.exe
    const localAdb = path.join(__dirname, 'adb.exe');
    if (fs.existsSync(localAdb)) return localAdb;

    // 3. 시스템 PATH
    return 'adb';
}

function execAdb(args, timeout) {
    timeout = timeout || 15000;
    const adbPath = getAdbPath();
    const cmd = `"${adbPath}" ${args}`;
    return new Promise((resolve, reject) => {
        exec(cmd, { encoding: 'utf8', timeout }, (error, stdout, stderr) => {
            if (error) reject(new Error(stderr || error.message));
            else resolve(stdout.trim());
        });
    });
}

async function isAdbAvailable() {
    try {
        await execAdb('version');
        return true;
    } catch (e) {
        return false;
    }
}

async function getConnectedDevices() {
    const output = await execAdb('devices');
    const lines = output.split('\n').slice(1);
    const devices = [];
    for (const line of lines) {
        const parts = line.trim().split('\t');
        if (parts.length === 2) {
            devices.push({ serial: parts[0], status: parts[1] });
        }
    }
    return devices;
}

async function checkDeviceStatus(deviceId) {
    const available = await isAdbAvailable();
    if (!available) {
        throw new Error('ADB를 찾을 수 없습니다.');
    }

    const devices = await getConnectedDevices();
    if (devices.length === 0) {
        throw new Error('ADB 기기가 연결되지 않았습니다. USB 디버깅을 활성화하세요.');
    }

    let device;
    if (deviceId) {
        device = devices.find(d => d.serial === deviceId);
        if (!device) throw new Error(`기기 "${deviceId}"를 찾을 수 없습니다.`);
    } else {
        device = devices.find(d => d.status === 'device');
        if (!device) {
            const unauthorized = devices.find(d => d.status === 'unauthorized');
            if (unauthorized) throw new Error('USB 디버깅 권한을 허용하세요 (폰 화면 확인).');
            throw new Error('사용 가능한 ADB 기기가 없습니다.');
        }
    }

    if (device.status === 'unauthorized') {
        throw new Error('USB 디버깅 권한을 허용하세요 (폰 화면 확인).');
    }

    let model = '';
    try {
        const deviceArg = deviceId ? `-s ${deviceId}` : '';
        model = await execAdb(`${deviceArg} shell getprop ro.product.model`);
    } catch (e) { /* ignore */ }

    return { connected: true, serial: device.serial, status: device.status, model };
}

async function toggleMobileData(deviceId, logFn) {
    const log = logFn || (() => {});
    const deviceArg = deviceId ? `-s ${deviceId}` : '';

    log('모바일 데이터 OFF...');
    await execAdb(`${deviceArg} shell svc data disable`);

    await delay(500);

    log('모바일 데이터 ON...');
    await execAdb(`${deviceArg} shell svc data enable`);
}

// 현재 USB 테더링(rndis) 상태 확인
async function getTetherStatus(deviceId) {
    const deviceArg = deviceId ? `-s ${deviceId}` : '';
    // sys.usb.config / sys.usb.state 에 rndis 가 포함되면 테더링 ON
    let raw = '';
    try { raw += await execAdb(`${deviceArg} shell getprop sys.usb.config`); } catch (e) { /* ignore */ }
    try { raw += ' ' + await execAdb(`${deviceArg} shell getprop sys.usb.state`); } catch (e) { /* ignore */ }
    return { on: /rndis/i.test(raw) };
}

// USB 테더링 ON/OFF
// enable=true  → svc usb setFunctions rndis  (테더링 켜기)
// enable=false → svc usb setFunctions        (기본 기능 복귀 = 테더링 끄기)
async function setUsbTethering(deviceId, enable, logFn) {
    const log = logFn || (() => {});
    const deviceArg = deviceId ? `-s ${deviceId}` : '';

    if (enable) {
        log('USB 테더링 ON (svc usb setFunctions rndis)...');
        await execAdb(`${deviceArg} shell svc usb setFunctions rndis`);
    } else {
        log('USB 테더링 OFF (기본 USB 기능 복귀)...');
        await execAdb(`${deviceArg} shell svc usb setFunctions`);
    }
}

module.exports = { getAdbPath, isAdbAvailable, getConnectedDevices, checkDeviceStatus, toggleMobileData, getTetherStatus, setUsbTethering };
