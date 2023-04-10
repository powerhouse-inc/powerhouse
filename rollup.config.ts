import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import dts from '@rollup/plugin-typescript';
import type { Plugin, RollupOptions } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import nodePolyfills from 'rollup-plugin-polyfill-node';

function replaceBrowserModules(): Plugin {
    return {
        name: 'replace-browser-modules',
        resolveId(source) {
            if (source.endsWith('/node')) {
                return 'src/document/utils/browser.ts';
            }
        },
    };
}

function emitModulePackageFile(): Plugin {
    return {
        generateBundle() {
            this.emitFile({
                fileName: 'package.json',
                source: `{"type":"module"}`,
                type: 'asset',
            });
        },
        name: 'emit-module-package-file',
    };
}

const input = {
    index: 'src/index.ts',
    'budget-statement': 'src/budget-statement/index.ts',
    document: 'src/document/index.ts',
};

const outputs: RollupOptions[] = [
    {
        input,
        plugins: [
            // nodeResolve(),
            esbuild({
                optimizeDeps: {
                    include: ['mime/lite', 'jszip'],
                },
            }),
        ],
        output: {
            dir: 'dist/node/cjs',
            entryFileNames: '[name].js',
            format: 'cjs',
            sourcemap: true,
        },
    },
    {
        input,
        plugins: [
            // nodeResolve(),
            esbuild({
                optimizeDeps: {
                    include: ['mime/lite', 'jszip'],
                },
            }),
            emitModulePackageFile(),
        ],
        output: {
            dir: 'dist/node/es/',
            entryFileNames: '[name].js',
            format: 'es',
            sourcemap: true,
        },
    },
    {
        input,
        plugins: [dts({ outDir: 'dist/node/types' })],
        output: {
            dir: 'dist/node/types/',
            entryFileNames: '[name].d.ts',
            format: 'es',
        },
    },
    {
        input: 'src/index.ts',
        plugins: [
            replaceBrowserModules(),
            nodePolyfills(),
            nodeResolve({ browser: true, preferBuiltins: false }),
            commonjs(),
            esbuild({
                optimizeDeps: {
                    include: ['immer', 'jszip', 'mime/lite'],
                    esbuildOptions: {
                        treeShaking: true,
                    },
                },
            }),
        ],
        output: [
            {
                file: 'dist/browser/umd/document-model.browser.js',
                format: 'umd',
                name: 'DocumentModel',
                sourcemap: true,
                exports: 'named',
            },
            {
                file: 'dist/browser/es/document-model.browser.js',
                format: 'es',
            },
        ],
    },
    {
        input,
        plugins: [
            nodePolyfills(),
            dts({
                outDir: 'dist/browser/types',
            }),
        ],
        output: {
            dir: 'dist/browser/types/',
            entryFileNames: '[name].d.ts',
            format: 'es',
        },
    },
];

export default outputs;
