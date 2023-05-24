import {
    BudgetStatementDocument,
    utils,
} from '@acaldas/document-model-libs/budget-statement';
import { BrowserWindow, Menu, app, dialog, ipcMain } from 'electron';
import path from 'path';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

const isMac = process.platform === 'darwin';
let handleFile: ((file: string) => Promise<void>) | undefined;
let window: BrowserWindow | undefined;

async function handleFileOpen() {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) {
        return;
    }
    const files = await dialog.showOpenDialogSync(window, {
        properties: ['openFile'],
    });
    if (files) {
        files.map(file => app.addRecentDocument(file));
        return utils.loadBudgetStatementFromFile(files[0]);
    }
}

async function handleFileSave(budgetStatement: BudgetStatementDocument) {
    if (!window) {
        return;
    }
    const filePath = await dialog.showSaveDialogSync(window, {
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
ipcMain.handle('dialog:saveFile', (_, args) => handleFileSave(args));

const createWindow = async (file?: string | undefined) => {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 1300,
        height: 940,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    });
    window = mainWindow;
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
                            if (window) {
                                handleFile?.(files[0]);
                            } else {
                                createWindow(files[0]);
                            }
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
    handleFile = async (file: string) => {
        if (file) {
            try {
                const budget = await utils.loadBudgetStatementFromFile(file);
                mainWindow.webContents.send('fileOpened', budget);
            } catch (error) {
                console.log('handleFile', error);
            }
        }
    };

    file && handleFile(file);

    mainWindow.on('close', () => {
        // ipcMain.removeHandler('dialog:openFile');
        // ipcMain.removeHandler('dialog:saveFile');
        window = undefined;
        handleFile = undefined;
    });

    // Open the DevTools.
    // mainWindow.webContents.openDevTools({ mode: "bottom" });
};

app.on('open-file', (_event, path) => {
    if (window) {
        handleFile?.(path);
    } else {
        createWindow(path);
    }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => createWindow());

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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
