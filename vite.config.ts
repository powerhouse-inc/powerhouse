import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { libInjectCss } from 'vite-plugin-lib-inject-css';
import svgr from 'vite-plugin-svgr';
import pkg from './package.json';

export default defineConfig({
    plugins: [
        svgr(),
        react(),
        libInjectCss(),
        dts({
            include: ['src'],
            exclude: ['src/stories'],
        }),
    ],
    build: {
        cssCodeSplit: true,
        sourcemap: true,
        rollupOptions: {
            external: [
                ...Object.keys(pkg.peerDependencies),
                'react/jsx-runtime',
            ],
        },
        lib: {
            entry: [resolve('src', 'index.ts')],
            formats: ['es'],
            fileName(_format, entryName) {
                return `${entryName}.js`;
            },
        },
    },
});
