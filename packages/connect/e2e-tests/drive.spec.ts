import { expect, test } from '@playwright/test';

import { getApp } from './utils/app-manager';
import { beforeAll } from './utils/before-all';
import { getAppInfo } from './utils/get-app-info';

test.describe('App', () => {
    test.beforeAll(beforeAll);

    test.afterAll(async () => {
        await getApp().close();
    });

    test('appInfo should be valid', () => {
        const appInfo = getAppInfo();

        expect(appInfo).toBeTruthy();
        expect(appInfo.arch).toBeTruthy();
        expect(appInfo.arch).toBe(process.arch);
        expect(appInfo.asar).toBe(true);
        expect(appInfo.executable).toBeTruthy();
        expect(appInfo.main).toBeTruthy();
        expect(appInfo.name).toBe('document-model-electron');
        expect(appInfo.packageJson).toBeTruthy();
        expect(appInfo.packageJson.name).toBe('document-model-electron');
        expect(appInfo.platform).toBeTruthy();
        expect(appInfo.platform).toBe(process.platform);
        expect(appInfo.resourcesDir).toBeTruthy();
    });
});
