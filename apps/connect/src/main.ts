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
import fs from 'node:fs';
import path, { basename } from 'path';
import initDocumentDrive from './app/document-drive';
import store from './app/store';
import { ConnectCrypto } from './services/crypto';
import { ElectronKeyStorage } from './services/crypto/electron';
import { Theme } from './store';
import { documentModels } from './store/document-model';

const isMac = process.platform === 'darwin';

async function initApp() {
    // if on mac sets app icon
    if (isMac) {
        const appIcon = nativeImage.createFromPath('src/assets/icon.png');
        app.dock.setIcon(appIcon);
    }

    // initializes connect key pair
    try {
        const keyStorage = new ElectronKeyStorage(store);
        // store.delete('connectkeyPair');
        const connectCrypto = new ConnectCrypto(keyStorage);
        await connectCrypto.initialize();

        ipcMain.handle('crypto:publicKey', () => connectCrypto.publicKey());

        // initializes document drive server
        await initDocumentDrive(
            documentModels,
            app.getPath('userData'),
            ipcMain,
        );

        // creates window
        await createWindow({
            onReady() {
                if (initFile) {
                    handleFile(initFile);
                }
            },
        });
    } catch (error) {
        console.error(error);
    }
}

app.setName('Powerhouse Connect');

app.commandLine.appendSwitch('enable-experimental-web-platform-features');

function handleFile(path: string, window?: Electron.BrowserWindow) {
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
            createWindow({
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

                createWindow({
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
    store.set('theme', theme);
    const { color, backgroundColor, titlebarColor } = getThemeColors(theme);

    BrowserWindow.getAllWindows().forEach(window => {
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
                    click: () => {
                        createWindow();
                    },
                },
                { type: 'separator' },
                {
                    label: 'Open',
                    accelerator: 'CommandOrControl+O',
                    click: () => {
                        const files = dialog.showOpenDialogSync(mainWindow, {
                            properties: ['openFile'],
                        });
                        if (files) {
                            files.map(file => app.addRecentDocument(file));
                            handleFile(
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

app.on('open-file', (_event, path) => {
    if (app.isReady()) {
        handleFile(path);
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

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// keeps track of the logged in user
let user: string;
ipcMain.handle('user', () => user);

// deeplink login

// const appProtocol = isDev ? 'connect-dev' : 'connect';

// addDeeplink(app, appProtocol, (event, url) => {
//     // gets user address from url
//     const address = url.slice(`${appProtocol}://`.length);
//     user = address;

//     // notifies all windows
//     BrowserWindow.getAllWindows().forEach((window, index) => {
//         window.webContents.send('login', address);
//         // shows first window if not in view
//         if (index === 0) {
//             window.show();
//         }
//     });
// });
