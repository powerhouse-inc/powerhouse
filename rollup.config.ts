import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import type { Plugin, RollupOptions } from 'rollup';
import dts from 'rollup-plugin-dts';
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
    'document-model': 'src/document-model/index.ts',
    'scope-framework': 'src/scope-framework/index.ts',
    'budget-statement': 'src/budget-statement/index.ts',
    document: 'src/document/index.ts',
};

const bundledDependencies = [
    'mime/lite',
    'jszip',
    '@acaldas/document-model-graphql',
    '@acaldas/document-model-graphql/document',
    '@acaldas/document-model-graphql/scope-framework',
    '@acaldas/document-model-graphql/budget-statement',
    '@acaldas/document-model-graphql/document-model',
];

const outputs: RollupOptions[] = [
    {
        input,
        plugins: [
            esbuild({
                optimizeDeps: {
                    include: bundledDependencies,
                },
                treeShaking: true,
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
            esbuild({
                optimizeDeps: {
                    include: bundledDependencies,
                },
                treeShaking: true,
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
        external: ['@acaldas/document-model-graphql'],
        plugins: [dts({ respectExternal: true })],
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
        output: {
            file: 'dist/browser/umd/document-model.browser.js',
            format: 'umd',
            name: 'DocumentModel',
            sourcemap: true,
            exports: 'named',
        },
    },
    {
        input,
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
        output: {
            dir: 'dist/browser/es/',
            entryFileNames: '[name].js',
            format: 'es',
            sourcemap: true,
        },
    },
    {
        input,
        external: [
            'immer',
            'mime/lite',
            '@acaldas/document-model-graphql',
            '@acaldas/document-model-graphql/document',
            '@acaldas/document-model-graphql/budget-statement',
            '@acaldas/document-model-graphql/scope-framework',
        ],
        plugins: [
            replaceBrowserModules(),
            nodePolyfills(),
            nodeResolve({ browser: true, preferBuiltins: false }),
            dts({ respectExternal: true }),
        ],
        output: {
            dir: 'dist/browser/types/',
            entryFileNames: '[name].d.ts',
            format: 'es',
        },
    },
];

export default outputs;
