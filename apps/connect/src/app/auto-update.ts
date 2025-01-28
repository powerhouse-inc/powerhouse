import { autoUpdater, dialog } from 'electron';

export function enableAutoUpdates(
    app: Electron.App,
    options: { interval?: number },
) {
    const server = process.env.AUTO_UPDATE_SERVER;
    const url = `${server}/update/${process.platform}/${app.getVersion()}`;
    console.log('Looking for updates:', url);

    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
        const dialogOpts = {
            type: 'info',
            buttons: ['Restart', 'Later'],
            title: 'Application Update',
            message: process.platform === 'win32' ? releaseNotes : releaseName,
            detail: 'A new version has been downloaded. Restart the application to apply the updates.',
        };

        dialog.showMessageBox(dialogOpts).then(returnValue => {
            if (returnValue.response === 0) autoUpdater.quitAndInstall();
        });
    });

    autoUpdater.on('error', message => {
        console.error('There was a problem updating the application');
        console.error(message);
    });

    // Handle creating/removing shortcuts on Windows when installing/uninstalling.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (require('electron-squirrel-startup')) {
        app.quit();
    }

    autoUpdater.setFeedURL({ url });

    app.on('ready', () => {
        setInterval(() => {
            autoUpdater.checkForUpdates();
        }, options.interval ?? 60000);
    });
}
