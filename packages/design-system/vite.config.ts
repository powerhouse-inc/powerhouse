import react from '@vitejs/plugin-react';
import path, { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import pkg from './package.json';

export default defineConfig(() => {
    return {
        test: {
            globals: true,
            environment: 'jsdom',
            setupFiles: './src/powerhouse/tests/setupTests.ts',
        },
        plugins: [
            react(),
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
