const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    config: {
        load: () => ipcRenderer.invoke('config:load'),
        save: (config) => ipcRenderer.invoke('config:save', config)
    },
    script: {
        generate: () => ipcRenderer.invoke('script:generate'),
        post: () => ipcRenderer.invoke('script:post'),
        postDraft: (accountId) => ipcRenderer.invoke('script:postDraft', accountId),
        autoAll: (selectedIds) => ipcRenderer.invoke('script:autoAll', selectedIds),
        stop: () => ipcRenderer.invoke('script:stop'),
        onLog: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('script:log', handler);
            return () => ipcRenderer.removeListener('script:log', handler);
        },
        onDone: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('script:done', handler);
            return () => ipcRenderer.removeListener('script:done', handler);
        }
    },
    keywords: {
        load: () => ipcRenderer.invoke('keywords:load'),
        reset: () => ipcRenderer.invoke('keywords:reset'),
        addCustom: (keywords) => ipcRenderer.invoke('keywords:addCustom', keywords),
        remove: (keyword) => ipcRenderer.invoke('keywords:remove', keyword)
    },
    history: {
        load: () => ipcRenderer.invoke('history:load')
    },
    result: {
        load: () => ipcRenderer.invoke('result:load'),
        delete: () => ipcRenderer.invoke('result:delete')
    },
    ip: {
        check: () => ipcRenderer.invoke('ip:check'),
        interfaces: () => ipcRenderer.invoke('ip:interfaces'),
        change: (interfaceName) => ipcRenderer.invoke('ip:change', interfaceName),
        onLog: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('ip:log', handler);
            return () => ipcRenderer.removeListener('ip:log', handler);
        }
    },
    naver: {
        loadAccounts: () => ipcRenderer.invoke('naver:loadAccounts'),
        addAccount: (id, pw) => ipcRenderer.invoke('naver:addAccount', { id, pw }),
        removeAccount: (id) => ipcRenderer.invoke('naver:removeAccount', id),
        selectAccount: (id) => ipcRenderer.invoke('naver:selectAccount', id),
        login: (id) => ipcRenderer.invoke('naver:login', id),
        onLoginLog: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('naver:loginLog', handler);
            return () => ipcRenderer.removeListener('naver:loginLog', handler);
        }
    },
    adb: {
        status: () => ipcRenderer.invoke('adb:status'),
        install: () => ipcRenderer.invoke('adb:install'),
        onInstallStart: (callback) => {
            const handler = (_event) => callback();
            ipcRenderer.on('adb:installStart', handler);
            return () => ipcRenderer.removeListener('adb:installStart', handler);
        },
        onInstallLog: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('adb:installLog', handler);
            return () => ipcRenderer.removeListener('adb:installLog', handler);
        },
        onInstallDone: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('adb:installDone', handler);
            return () => ipcRenderer.removeListener('adb:installDone', handler);
        }
    },
    openExternal: (url) => ipcRenderer.invoke('open:external', url),
    app: {
        getVersion: () => ipcRenderer.invoke('app:version')
    },
    update: {
        check: () => ipcRenderer.invoke('update:check'),
        onNotAvailable: (callback) => {
            const handler = (_event) => callback();
            ipcRenderer.on('update:notAvailable', handler);
            return () => ipcRenderer.removeListener('update:notAvailable', handler);
        },
        onError: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('update:error', handler);
            return () => ipcRenderer.removeListener('update:error', handler);
        },
        onAvailable: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('update:available', handler);
            return () => ipcRenderer.removeListener('update:available', handler);
        },
        onProgress: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('update:progress', handler);
            return () => ipcRenderer.removeListener('update:progress', handler);
        },
        onDownloaded: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('update:downloaded', handler);
            return () => ipcRenderer.removeListener('update:downloaded', handler);
        },
        install: () => ipcRenderer.invoke('update:install')
    }
});
