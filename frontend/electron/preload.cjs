const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    enterMiniMode: (users) => ipcRenderer.send('enter-mini-mode', users),
    exitMiniMode: () => ipcRenderer.send('exit-mini-mode'),
    syncMiniAvatars: (users) => ipcRenderer.send('sync-mini-avatars', users),
    windowControl: (action) => ipcRenderer.send('window-control', action)
});
