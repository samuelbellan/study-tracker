const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Verifica se estamos em desenvolvimento usando uma variável de ambiente definida no cross-env
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: true,
            contextIsolation: false // Simplificando para facilitar o uso do socket.io diretamente se necessário, mas idealmente seria true
        },
        titleBarStyle: 'hidden', // Estilo de janela moderno (opcional, pode remover se não quiser barras customizadas)
        titleBarOverlay: {
            color: '#1a1a2e',
            symbolColor: '#ffffff',
        }
    });

    if (isDev) {
        // Em desenvolvimento, carrega o servidor local do Vite
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        // Em produção, carrega os arquivos estáticos buildados
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // Setup auto-updater listeners and check for updates
    if (!isDev) {
        autoUpdater.checkForUpdatesAndNotify();

        autoUpdater.on('update-available', () => {
            dialog.showMessageBox({
                type: 'info',
                title: 'Atualização Encontrada',
                message: 'Uma nova versão do Study Tracker está disponível. O download começará em segundo plano.',
            });
        });

        autoUpdater.on('update-downloaded', () => {
            dialog.showMessageBox({
                type: 'info',
                title: 'Atualização Pronta',
                message: 'A atualização foi baixada. O aplicativo será reiniciado para instalar a nova versão.',
                buttons: ['Reiniciar Agora']
            }).then(() => {
                autoUpdater.quitAndInstall();
            });
        });
    }
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
