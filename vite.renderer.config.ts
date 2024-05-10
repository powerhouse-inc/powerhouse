import react from '@vitejs/plugin-react';
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label';
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh';
import path from 'path';
import { HtmlTagDescriptor, defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';
import { createHtmlPlugin } from 'vite-plugin-html';

import clientConfig from './client.config';

export default defineConfig({
    plugins: [
        react({
            include: 'src/**/*.tsx',
            babel: {
                minified: false,
                plugins: [jotaiDebugLabel, jotaiReactRefresh],
            },
        }),
        svgr(),
        createHtmlPlugin({
            minify: true,
            inject: {
                tags: [
                    ...clientConfig.meta.map((meta) => ({
                        ...meta,
                        injectTo: 'head',
                    })) as HtmlTagDescriptor[],
                ]
            },
        }),
    ],
    build: {
        minify: false,
        sourcemap: false,
    },
    resolve: {
        alias: {
            '@/assets': path.resolve(__dirname, './assets'),
            src: path.resolve(__dirname, './src'),
            'connect-config': path.resolve(__dirname, './connect.config.ts'),
            path: 'rollup-plugin-node-polyfills/polyfills/path',
            events: 'rollup-plugin-node-polyfills/polyfills/events',
        },
    },
});
