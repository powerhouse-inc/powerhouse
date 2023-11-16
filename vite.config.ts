import react from '@vitejs/plugin-react';
import path, { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { libInjectCss } from 'vite-plugin-lib-inject-css';
import pkg from './package.json';

export default defineConfig(props => {
    return {
        plugins: [
            react(),
            libInjectCss(),
            dts({
                include: ['src/**'],
                exclude: ['src/**/*.stories.*'],
            }),
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
            },
        },
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
    };
});
