import { _electron as electron } from 'playwright-core';
import { setApp } from './app-manager';
import { getAppInfo } from './get-app-info';

export const beforeAll = async () => {
    const appInfo = getAppInfo();

    const electronApp = await electron.launch({
        args: [appInfo.main],
        executablePath: appInfo.executable,
    });

    setApp(electronApp);
    electronApp.on('window', page => {
        const filename = page.url().split('/').pop();
        console.log(`Window opened: ${filename}`);

        // capture errors
        page.on('pageerror', error => {
            console.error(error);
        });
        // capture console messages
        page.on('console', msg => {
            console.log(msg.text());
        });
    });
};
