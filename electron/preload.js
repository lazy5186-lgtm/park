const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    config: {
        load: () => ipcRenderer.invoke('config:load'),
        save: (config) => ipcRenderer.invoke('config:save', config)
    },
    script: {
        generate: () => ipcRenderer.invoke('script:generate'),
        post: () => ipcRenderer.invoke('script:post'),
        auto: () => ipcRenderer.invoke('script:auto'),
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
        reset: () => ipcRenderer.invoke('keywords:reset')
    },
    history: {
        load: () => ipcRenderer.invoke('history:load')
    },
    result: {
        load: () => ipcRenderer.invoke('result:load')
    }
});
