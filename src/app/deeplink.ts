// TODO: electron-deeplink dep is deprecated, we need to find a new alternative

// const { Deeplink } = require('electron-deeplink');
// import { BrowserWindow } from 'electron';
// import isDev from 'electron-is-dev';

// export function addDeeplink(
//     app: Electron.App,
//     protocol: string,
//     handleOpenUrl: (event: Electron.Event, url: string) => void
// ) {
//     app.on('ready', () => {
//         new Deeplink({
//             app,
//             protocol: protocol,
//             isDev,
//             debugLogging: true,
//             mainWindow: BrowserWindow.getFocusedWindow(),
//         });
//     });

//     app.on('open-url', (event, url) => {
//         console.log('OPEN URL, url');
//         if (url.startsWith(`${protocol}://`)) {
//             handleOpenUrl(event, url);
//         }
//     });
// }
