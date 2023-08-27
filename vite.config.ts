import { Plugin, defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

function replaceBrowserModules(): Plugin {
    return {
        name: 'replace-browser-modules',
        resolveId(source) {
            if (source.endsWith('/node')) {
                return 'src/document/utils/browser.ts';
            }
        },
        enforce: 'pre',
    };
}

const entry = {
    index: 'src/index.ts',
    'document-model': 'src/document-model/index.ts',
    document: 'src/document/index.ts',
};

export default defineConfig(({ mode = 'node' }) => {
    const isBrowser = mode === 'browser';
    const external = [
        'immer',
        'json-stringify-deterministic',
        'jszip',
        'mime',
        'sha.js',
        'sha.js/sha1',
        'zod',
    ];

    // if building for node then don't polyfill node core modules
    if (!isBrowser) {
        external.push('path', 'crypto', 'fs', 'https');
    }

    return {
        build: {
            outDir: `dist/${mode}`,
            emptyOutDir: true,
            lib: {
                entry,
                formats: ['es'],
            },
            rollupOptions: {
                external,
                output: {
                    entryFileNames: '[name].js',
                    format: 'es',
                },
            },
        },
        plugins: [
            isBrowser ? replaceBrowserModules() : undefined,
            dts({ insertTypesEntry: true }),
        ],
    };
});
