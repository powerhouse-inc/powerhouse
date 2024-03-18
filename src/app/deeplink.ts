// TODO: electron-deeplink dep is deprecated, we need to find a new alternative
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { Deeplink } = require('electron-deeplink');
import isDev from 'electron-is-dev';

export function addDeeplink(
    app: Electron.App,
    window: Electron.BrowserWindow,
    protocol: string,
    handleOpenUrl: (event: Electron.Event, url: string) => void,
) {
    app.on('ready', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        new Deeplink({
            app,
            protocol: protocol,
            isDev,
            debugLogging: true,
            mainWindow: window,
        });
    });

    app.on('open-url', (event, url) => {
        if (url.startsWith(`${protocol}://`)) {
            handleOpenUrl(event, url);
        }
    });
}
