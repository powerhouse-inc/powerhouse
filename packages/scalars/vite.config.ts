import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import generateFile from 'vite-plugin-generate-file';

const entry = {
    index: 'src/index.ts',
};

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
            entry,
            formats: ['es', 'cjs'],
        },
        rollupOptions: {
            output: {
                entryFileNames: '[format]/[name].js',
                chunkFileNames: '[format]/internal/[name]-[hash].js',
                exports: 'named',
            },
        },
        sourcemap: true,
        minify: false,
    },
    plugins: [
        dts({ insertTypesEntry: true, outDir: 'dist/types' }),
        generateFile([
            {
                type: 'json',
                output: './es/package.json',
                data: {
                    type: 'module',
                },
            },
            {
                type: 'json',
                output: `./cjs/package.json`,
                data: {
                    type: 'commonjs',
                },
            },
        ]),
    ],
});
