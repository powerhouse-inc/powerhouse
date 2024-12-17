import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname =
    import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));

const outdir = path.resolve(dirname, '../dist/studio');

function copyCLIScript() {
    fs.copyFileSync(
        path.resolve(dirname, 'cli.js'),
        path.resolve(outdir, 'cli.js'),
    );
}

function copyEnvFile() {
    fs.copyFileSync(
        path.resolve(dirname, '../.env'),
        path.resolve(outdir, '../.env'),
    );
}

await build({
    outdir,
    platform: 'node',
    format: 'esm',
    bundle: true,
    packages: 'external',
    logLevel: 'info',
    entryPoints: [path.resolve(dirname, 'index.ts')],
})
    .then(() => {
        copyCLIScript();
        copyEnvFile();
    })
    .catch(() => process.exit(1));
