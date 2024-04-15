/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
    BrowserWindow,
    Menu,
    app,
    dialog,
    ipcMain,
    nativeImage,
    shell,
} from 'electron';
import isDev from 'electron-is-dev';
import type ElectronStore from 'electron-store';
import fs from 'node:fs';
import path, { basename } from 'path';
import { addDeeplink } from './app/deeplink';
import initDocumentDrive from './app/document-drive';
import store from './app/store';
import { ConnectCrypto } from './services/crypto';
import {
    ElectronKeyStorage,
    KeyStorageElectronStore,
} from './services/crypto/electron';
import { initRenownElectron } from './services/renown/electron';
import { Theme, isTheme } from './store/';
import { documentModels } from './store/document-model';

const isMac = process.platform === 'darwin';

async function initApp() {
    // if on mac sets app icon
    if (isMac) {
        const appIcon = nativeImage.createFromPath('src/assets/icon.png');
        app.dock.setIcon(appIcon);
    }

    try {
        // initializes connect key pair
        const keyStorage = new ElectronKeyStorage(
            store as unknown as ElectronStore<KeyStorageElectronStore>,
        );
        const connectCrypto = new ConnectCrypto(keyStorage);
        const connectId = await connectCrypto.did();
        const renown = initRenownElectron(connectId);

        ipcMain.handle('crypto:did', () => connectCrypto.did());
        ipcMain.handle('crypto:regenerateDid', async () => {
            await connectCrypto.regenerateDid();
            renown.connectId = await connectCrypto.did();
        });

        // keeps track of the logged in user
        ipcMain.handle('renown:user', () => {
            return renown.user;
        });

        ipcMain.handle('renown:login', (_e, did: string) => {
            return renown.login(did);
        });

        ipcMain.handle('renown:logout', () => {
            return renown.logout();
        });

        // notifies all windows
        renown.on('user', user => {
            BrowserWindow.getAllWindows().forEach((window, index) => {
                window.webContents.send('renown:on:user', user);
                // shows first window if not in view
                if (index === 0) {
                    window.show();
                }
            });
        });

        // initializes document drive server
        await initDocumentDrive(
            documentModels,
            app.getPath('userData'),
            ipcMain,
        );

        // creates window
        const browserWindow = await createWindow({
            async onReady() {
                if (initFile) {
                    await handleFile(initFile);
                }
            },
        });

        // deeplink login
        const appProtocol = isDev ? 'phd-dev' : 'phd';
        addDeeplink(app, browserWindow, appProtocol, async (_e, url) => {
            try {
                const text = decodeURIComponent(url).slice(
                    `${appProtocol}://`.length,
                );

                // gets route from url
                const [route, ...rest] = text.split('/');
                const content = rest.join('/');

                switch (route) {
                    case 'login':
                        await renown.login(content);
                        break;
                    case 'open':
                        await openUrl(content);
                        break;
                    default:
                        throw new Error('Route not found');
                }
            } catch (error) {
                console.error(`Url ${url} is not supported`, error);
            }
        });
        ipcMain.handle('protocol', () => appProtocol);
    } catch (error) {
        console.error(error);
    }
}

async function openUrl(url: string) {
    const window =
        BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows().pop();
    if (window) {
        window.webContents.send('handleURL', url);
    } else {
        await createWindow({
            onReady(window) {
                window.webContents.send('handleURL', url);
            },
        });
    }
}

app.setName('Powerhouse Connect');

app.commandLine.appendSwitch('enable-experimental-web-platform-features');

async function handleFile(path: string, window?: Electron.BrowserWindow) {
    try {
        const content = fs
            .readFileSync(path, { encoding: 'binary' })
            .toString();
        const file = {
            name: basename(path),
            content,
        };
        const _window = window ?? BrowserWindow.getFocusedWindow();
        if (_window) {
            _window.webContents.send('openFile', file);
        } else {
            await createWindow({
                onReady(window) {
                    window.webContents.send('openFile', file);
                },
            });
        }
    } catch (error) {
        console.log('handleFile', error);
    }
}

function handleFileSave(path?: string) {
    if (path) {
        app.addRecentDocument(path);
    }
}

ipcMain.handle('fileSaved', (e, document: Document, path?: string) =>
    handleFileSave(path),
);

ipcMain.handle('openURL', (e, url) => shell.openExternal(url));

ipcMain.handle('showTabMenu', (event, tab) => {
    const template = [
        {
            label: 'Move to new window',
            click: async () => {
                event.sender.send('removeTab', tab);
                await createWindow({
                    onReady: window => {
                        window.webContents.send('addTab', tab);
                    },
                });
            },
        },
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({
        window: BrowserWindow.fromWebContents(event.sender) ?? undefined,
    });
});

function getThemeColors(theme: Theme) {
    // TODO read from tailwind config
    const color = theme === 'dark' ? '#fefefe' : '#141718';
    const backgroundColor = theme === 'dark' ? '#141718' : '#FFFFFF';
    const titlebarColor = theme === 'dark' ? '#0A0A0A' : '#F1F1F1';
    return { color, backgroundColor, titlebarColor };
}

ipcMain.on('theme', (_, theme) => {
    if (!isTheme(theme)) {
        throw new Error(`Invalid theme: ${theme}`);
    }
    store.set('theme', theme);
    const { color, backgroundColor, titlebarColor } = getThemeColors(theme);

    BrowserWindow.getAllWindows().forEach(window => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (window.setTitleBarOverlay) {
            window.setTitleBarOverlay({
                color: titlebarColor,
                symbolColor: color,
                height: 30,
            });
        }
        window.setBackgroundColor(backgroundColor);
    });
});

const createWindow = async (options?: {
    onReady?: (window: BrowserWindow) => void;
}) => {
    const theme = 'light'; // store.get('theme', 'light') as Theme; TODO retrieve initial theme from store

    const { color, backgroundColor, titlebarColor } = getThemeColors(theme);

    // Create the browser window.
    const mainWindow = new BrowserWindow({
        title: 'Connect',
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: titlebarColor,
            symbolColor: color,
            height: 30,
        },
        backgroundColor: backgroundColor,
        width: 1300,
        height: 940,
        minHeight: 350,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            devTools: !app.isPackaged || process.env.NODE_ENV !== 'production',
        },
    });

    const template = [
        ...(isMac
            ? [
                  {
                      label: app.name,
                      submenu: [
                          { role: 'about' },
                          { type: 'separator' },
                          { role: 'services' },
                          { type: 'separator' },
                          { role: 'hide' },
                          { role: 'hideOthers' },
                          { role: 'unhide' },
                          { type: 'separator' },
                          { role: 'quit' },
                      ],
                  },
              ]
            : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Window',
                    accelerator: 'CommandOrControl+Shift+N',
                    click: async () => {
                        await createWindow();
                    },
                },
                { type: 'separator' },
                {
                    label: 'Open',
                    accelerator: 'CommandOrControl+O',
                    click: async () => {
                        const files = dialog.showOpenDialogSync(mainWindow, {
                            properties: ['openFile'],
                        });
                        if (files) {
                            files.map(file => app.addRecentDocument(file));
                            await handleFile(
                                files[0],
                                mainWindow.isDestroyed()
                                    ? undefined
                                    : mainWindow,
                            );
                        }
                    },
                },
                {
                    label: 'Save',
                    accelerator: 'CommandOrControl+S',
                    click: () => {
                        try {
                            const focusedWindow =
                                BrowserWindow.getFocusedWindow();
                            focusedWindow?.webContents.send('saveFile');
                        } catch (error) {
                            console.log('Error saving file', error);
                        }
                    },
                },
                {
                    role: 'recentDocuments',
                    submenu: [
                        {
                            label: 'Clear Recent',
                            role: 'clearrecentdocuments',
                        },
                    ],
                },
                { role: isMac ? 'close' : 'quit', label: 'Exit' },
            ],
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                ...(isMac
                    ? [
                          { role: 'pasteAndMatchStyle' },
                          { role: 'delete' },
                          { role: 'selectAll' },
                          { type: 'separator' },
                          {
                              label: 'Speech',
                              submenu: [
                                  { role: 'startSpeaking' },
                                  { role: 'stopSpeaking' },
                              ],
                          },
                      ]
                    : [
                          { role: 'delete' },
                          { type: 'separator' },
                          { role: 'selectAll' },
                      ]),
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac
                    ? [
                          { type: 'separator' },
                          { role: 'front' },
                          { type: 'separator' },
                          { role: 'window' },
                      ]
                    : [{ role: 'close' }]),
            ],
        },
    ];

    mainWindow.webContents.ipc.once('ready', () => {
        options?.onReady?.(mainWindow);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const menu = Menu.buildFromTemplate(template as any);
    Menu.setApplicationMenu(menu);

    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        await mainWindow.loadFile(
            path.join(
                __dirname,
                `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
            ),
        );
    }

    mainWindow.on('close', () => {
        // TODO
    });

    // Open the DevTools.
    // mainWindow.webContents.openDevTools({ mode: 'bottom' });
    return mainWindow;
};

let initFile: string;

app.on('open-file', async (_event, path) => {
    if (app.isReady()) {
        await handleFile(path);
    } else {
        initFile = path;
    }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
    return initApp();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', async () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
    }
});

ipcMain.handle('isPackaged', () => app.isPackaged);
