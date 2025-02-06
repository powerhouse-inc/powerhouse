import { expect, test } from '@playwright/test';
import path from 'path';

import { findLatestBuild } from 'electron-playwright-helpers';

function runTests({ out_dir = 'out' }: { out_dir?: string }) {
    const build = findLatestBuild(out_dir);
    expect(build).toBeTruthy();
    expect(build.startsWith(path.join(process.cwd(), 'out'))).toEqual(true);
}

test.describe('findLatestBuild', () => {
    test('findLatestBuild: no path', () => {
        runTests({});
    });

    test('findLatestBuild: "out"', () => {
        runTests({ out_dir: 'out' });
    });

    test('findLatestBuild: "./out"', () => {
        runTests({ out_dir: './out' });
    });

    test('findLatestBuild: "path.join(process.cwd(), \'out\')"', () => {
        console.log(path.join(process.cwd(), 'out'));
        runTests({ out_dir: path.join(process.cwd(), 'out') });
    });
});
