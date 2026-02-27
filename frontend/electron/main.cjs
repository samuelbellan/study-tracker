const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// CRITICAL: Required for transparent windows on Windows
app.disableHardwareAcceleration();

const isDev = process.env.NODE_ENV === 'development';

// Arquivo para salvar posições dos avatares
const positionFile = path.join(app.getPath('userData'), 'mini-positions.json');

function loadPositions() {
    try {
        if (fs.existsSync(positionFile)) {
            return JSON.parse(fs.readFileSync(positionFile, 'utf8'));
        }
    } catch (e) { /* ignore */ }
    return {};
}

function savePositions(positions) {
    try {
        fs.writeFileSync(positionFile, JSON.stringify(positions));
    } catch (e) { /* ignore */ }
}

let mainWindow = null;
let miniWindows = {}; // username -> BrowserWindow
let savedPositions = {};
let isMiniModeActive = false;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        frame: false,
        transparent: false,
        backgroundColor: '#0f172a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true
        },
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        closeAllMiniWindows();
    });
}

function getDefaultPosition(index) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: sw, height: sh } = primaryDisplay.workAreaSize;
    // Escalonar avatares no canto inferior direito, com offset horizontal
    return {
        x: sw - 100 - (index * 90),
        y: sh - 100
    };
}

function createAvatarWindow(username, isStudying, isMe, index) {
    savedPositions = loadPositions();
    const pos = savedPositions[username] || getDefaultPosition(index);

    const avatarWin = new BrowserWindow({
        width: 80,
        height: 80,
        x: pos.x,
        y: pos.y,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        roundedCorners: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true
        },
    });

    // Carregar com parâmetros do avatar
    const params = `mini=true&user=${encodeURIComponent(username)}&studying=${isStudying}&me=${isMe}`;
    if (isDev) {
        avatarWin.loadURL(`http://localhost:5173?${params}`);
    } else {
        avatarWin.loadFile(path.join(__dirname, '../dist/index.html'), {
            query: { mini: 'true', user: username, studying: String(isStudying), me: String(isMe) }
        });
    }

    // Salvar posição quando arrastado
    avatarWin.on('moved', () => {
        if (avatarWin && !avatarWin.isDestroyed()) {
            const [x, y] = avatarWin.getPosition();
            savedPositions[username] = { x, y };
            savePositions(savedPositions);
        }
    });

    avatarWin.on('closed', () => {
        delete miniWindows[username];
    });

    miniWindows[username] = avatarWin;
}

function closeAllMiniWindows() {
    Object.keys(miniWindows).forEach(key => {
        const win = miniWindows[key];
        if (win && !win.isDestroyed()) {
            win.destroy();
        }
    });
    miniWindows = {};
}

app.whenReady().then(() => {
    createMainWindow();

    app.on('activate', function () {
        if (!mainWindow && Object.keys(miniWindows).length === 0) createMainWindow();
    });

    // ===== IPC: Entrar no Mini Mode (cria janelas para cada avatar) =====
    ipcMain.on('enter-mini-mode', (event, users) => {
        isMiniModeActive = true;
        if (mainWindow) {
            mainWindow.hide();
        }
        closeAllMiniWindows();
        savedPositions = loadPositions();

        users.forEach((user, index) => {
            createAvatarWindow(user.username, user.isStudying, user.isMe, index);
        });
    });

    // ===== IPC: Sincronizar avatares (amigos entram/saem) =====
    ipcMain.on('sync-mini-avatars', (event, users) => {
        if (!isMiniModeActive) return; // Guard: só sincroniza se está no mini mode
        const currentUsernames = new Set(Object.keys(miniWindows));
        const newUsernames = new Set(users.map(u => u.username));

        // Remover janelas de quem saiu
        currentUsernames.forEach(name => {
            if (!newUsernames.has(name)) {
                const win = miniWindows[name];
                if (win && !win.isDestroyed()) win.destroy();
                delete miniWindows[name];
            }
        });

        // Adicionar janelas de quem chegou
        users.forEach((user, index) => {
            if (!miniWindows[user.username]) {
                createAvatarWindow(user.username, user.isStudying, user.isMe, index);
            }
        });

        // Atualizar status de estudo (recarregar URL com novo status)
        users.forEach(user => {
            const win = miniWindows[user.username];
            if (win && !win.isDestroyed()) {
                const params = `mini=true&user=${encodeURIComponent(user.username)}&studying=${user.isStudying}&me=${user.isMe}`;
                if (isDev) {
                    win.loadURL(`http://localhost:5173?${params}`);
                } else {
                    win.loadFile(path.join(__dirname, '../dist/index.html'), {
                        query: { mini: 'true', user: user.username, studying: String(user.isStudying), me: String(user.isMe) }
                    });
                }
            }
        });
    });

    // ===== IPC: Sair do Mini Mode =====
    ipcMain.on('exit-mini-mode', (event) => {
        isMiniModeActive = false;
        closeAllMiniWindows();
        if (mainWindow) {
            mainWindow.show();
            mainWindow.center();
        } else {
            createMainWindow();
        }
    });

    // ===== IPC: Controles da janela =====
    ipcMain.on('window-control', (event, action) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;
        if (action === 'minimize') win.minimize();
        if (action === 'maximize') {
            if (win.isMaximized()) win.unmaximize();
            else win.maximize();
        }
        if (action === 'close') win.close();
    });

    // ===== Auto-Updater =====
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
