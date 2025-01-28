import { expect, Page, test } from '@playwright/test';

import { getApp } from './utils/app-manager';
import { beforeAll } from './utils/before-all';

test.describe('Drive', () => {
    test.beforeAll(beforeAll);

    test.afterAll(async () => {
        await getApp().close();
    });

    test('should render drive sections', async () => {
        const page = (await getApp().firstWindow()) as Page;
        await expect(page.getByText('Public Drives')).toBeVisible();
        await expect(page.getByText('Secure Cloud Drives')).toBeVisible();
        await expect(page.getByText('My Local Drives')).toBeVisible();
    });

    test('should allow user to add a local drive', async () => {
        const page = (await getApp().firstWindow()) as Page;
        await page
            .locator(
                '//*[@id="app"]/div/div/div[1]/div[1]/div[2]/div[3]/div[1]/div/button[1]',
            )
            .click();
        await page.locator('//*[@id="driveName"]').fill('Test Drive');
        await page.getByRole('button', { name: /Create new drive/i }).click();
        await expect(page.getByText('Test Drive')).toBeVisible();
    });

    test('should delete local drive', async () => {
        const page = (await getApp().firstWindow()) as Page;
        await page.getByText('Test Drive').hover();

        await page
            .getByRole('article')
            .filter({ hasText: 'Test Drive' })
            .getByRole('button')
            .filter({ hasNotText: 'Test Drive' })
            .click();

        await page.getByText('Delete').click();
        await expect(page.getByText('Test Drive')).not.toBeVisible();
    });
});
