/* eslint-disable no-undef */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname =
    import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));

const outdir = path.resolve(dirname, '../dist/studio');

/**
 * @param {string} dirnamePath
 */
function copyFileToOutdir(dirnamePath) {
    return fs.copyFileSync(
        path.resolve(dirname, dirnamePath),
        path.resolve(outdir, dirnamePath),
    );
}

await build({
    outdir,
    platform: 'node',
    format: 'esm',
    bundle: true,
    packages: 'external',
    logLevel: 'info',
    entryPoints: [
        path.resolve(dirname, 'index.ts'),
        path.resolve(dirname, 'hmr.ts'),
    ],
})
    .then(() => {
        copyFileToOutdir('cli.js');
        copyFileToOutdir('../.env');
    })
    .catch(() => process.exit(1));