import {
    BudgetStatementDocument,
    utils,
} from '@acaldas/document-model-libs/budget-statement';
import { BrowserWindow, Menu, app, dialog, ipcMain, shell } from 'electron';
import isDev from 'electron-is-dev';
import path from 'path';
import { addDeeplink } from './app/deeplink';

const isMac = process.platform === 'darwin';

async function handleFile(file: string, window?: Electron.BrowserWindow) {
    try {
        const budget = await utils.loadBudgetStatementFromFile(file);
        const _window = window ?? BrowserWindow.getFocusedWindow();
        if (_window) {
            _window.webContents.send('fileOpened', budget);
        } else {
            createWindow({
                onReady(window) {
                    window.webContents.send('fileOpened', budget);
                },
            });
        }
    } catch (error) {
        console.log('handleFile', error);
    }
}

async function handleFileOpen() {
    const files = await dialog.showOpenDialogSync({
        properties: ['openFile'],
    });
    if (files) {
        files.map(file => app.addRecentDocument(file));
        return utils.loadBudgetStatementFromFile(files[0]);
    }
}

async function handleFileSave(budgetStatement: BudgetStatementDocument) {
    const filePath = await dialog.showSaveDialogSync({
        properties: ['showOverwriteConfirmation', 'createDirectory'],
        defaultPath: budgetStatement?.data.month ?? 'budget',
    });

    if (filePath) {
        const index = filePath.lastIndexOf(path.sep);
        const dirPath = filePath.slice(0, index);
        const name = filePath.slice(index);
        const savedPath = await utils.saveBudgetStatementToFile(
            budgetStatement,
            dirPath,
            name
        );
        app.addRecentDocument(savedPath);
    }
}

ipcMain.handle('dialog:openFile', handleFileOpen);
ipcMain.handle('dialog:saveFile', (e, args) => handleFileSave(args));

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

const createWindow = async (options?: {
    onReady?: (window: BrowserWindow) => void;
}) => {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 1300,
        height: 940,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
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
                    click: async () => {
                        const files = await dialog.showOpenDialogSync(
                            mainWindow,
                            {
                                properties: ['openFile'],
                            }
                        );
                        if (files) {
                            files.map(file => app.addRecentDocument(file));
                            handleFile(
                                files[0],
                                mainWindow.isDestroyed()
                                    ? undefined
                                    : mainWindow
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
                            focusedWindow?.webContents.send('fileSaved');
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

    const menu = Menu.buildFromTemplate(template as any);
    Menu.setApplicationMenu(menu);

    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        await mainWindow.loadFile(
            path.join(
                __dirname,
                `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`
            )
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
    createWindow({
        onReady() {
            if (initFile) {
                handleFile(initFile);
            }
        },
    });
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

const appProtocol = isDev ? 'connect-dev' : 'connect';
addDeeplink(app, appProtocol, (event, url) => {
    // gets user address from url
    const address = url.slice(`${appProtocol}://`.length);
    user = address;

    // notifies all windows
    BrowserWindow.getAllWindows().forEach((window, index) => {
        window.webContents.send('login', address);
        // shows first window if not in view
        if (index === 0) {
            window.show();
        }
    });
});
