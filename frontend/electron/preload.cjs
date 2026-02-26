const { contextBridge, ipcRenderer } = require('electron');

// Expondo APIs seguras para o frontend, se necessário
contextBridge.exposeInMainWorld('electronAPI', {
    // adicione métodos futuramente se precisar de IPC
});
