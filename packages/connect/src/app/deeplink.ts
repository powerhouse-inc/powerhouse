// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
import path from 'path';

export function addDeeplink(
    app: Electron.App,
    window: Electron.BrowserWindow,
    protocol: string,
    handleOpenUrl: (event: Electron.Event, url: string) => void,
) {
    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient(protocol, process.execPath, [
                path.resolve(process.argv[1]),
            ]);
        }
    } else {
        app.setAsDefaultProtocolClient(protocol);
    }

    app.on('open-url', (event, url) => {
        if (url.startsWith(`${protocol}://`)) {
            handleOpenUrl(event, url);
        }
    });
}
