import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import {
    BudgetStatementDocument,
    utils,
} from "@acaldas/document-model-libs/budget-statement";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
    app.quit();
}

const createWindow = () => {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 1300,
        height: 940,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
        },
    });

    async function handleFileOpen() {
        const files = await dialog.showOpenDialogSync(mainWindow, {
            properties: ["openFile"],
        });
        if (files) {
            return utils.loadBudgetStatementFromFile(files[0]);
        }
    }

    async function handleFileSave(budgetStatement: BudgetStatementDocument) {
        const filePath = await dialog.showSaveDialogSync(mainWindow, {
            properties: ["showOverwriteConfirmation", "createDirectory"],
            defaultPath: budgetStatement?.data.month ?? "budget",
        });

        if (filePath) {
            const index = filePath.lastIndexOf(path.sep);
            const dirPath = filePath.slice(0, index);
            const name = filePath.slice(index);
            await utils.saveBudgetStatementToFile(
                budgetStatement,
                dirPath,
                name
            );
        }
    }

    ipcMain.handle("dialog:openFile", handleFileOpen);
    ipcMain.handle("dialog:saveFile", (_, args) => handleFileSave(args));

    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(
            path.join(
                __dirname,
                `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`
            )
        );
    }

    // Open the DevTools.
    // mainWindow.webContents.openDevTools({ mode: "bottom" });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
