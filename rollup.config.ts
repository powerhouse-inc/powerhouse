import type { Plugin, RollupOptions } from 'rollup';
import dts from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';

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
            dir: 'dist/',
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
            dir: 'dist/es/',
            entryFileNames: '[name].js',
            format: 'es',
            sourcemap: true,
        },
    },
    {
        input: 'src/index.ts',
        plugins: [dts({ respectExternal: true })],
        output: {
            file: 'dist/index.d.ts',
            format: 'es',
        },
    },
];

export default outputs;
