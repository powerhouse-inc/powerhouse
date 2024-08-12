import react from '@vitejs/plugin-react';
import fs from 'fs';
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label';
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh';
import path from 'path';
import { HtmlTagDescriptor, defineConfig, loadEnv } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import svgr from 'vite-plugin-svgr';
import pkg from './package.json';

import clientConfig from './client.config';

const appVersion = pkg.version;

const generateVersionPlugin = (hardRefresh = false) => {
    return {
        name: 'generate-version',
        closeBundle() {
            const versionManifest = {
                version: appVersion,
                requiresHardRefresh: hardRefresh,
            };

            fs.writeFileSync(
                path.join('dist', 'version.json'),
                JSON.stringify(versionManifest, null, 2),
            );
        },
    };
};

export default defineConfig(({ mode }) => {
    const isProd = mode === 'production';
    const env = loadEnv(mode, process.cwd());

    const requiresHardRefresh = env.VITE_APP_REQUIRES_HARD_REFRESH === 'true';

    return {
        define: {
            'process.env': {
                APP_VERSION: appVersion,
                REQUIRES_HARD_REFRESH: isProd ? requiresHardRefresh : false,
            },
        },
        plugins: [
            react({
                include: 'src/**/*.tsx',
                babel: {
                    plugins: isProd ? [] : [jotaiDebugLabel, jotaiReactRefresh],
                },
            }),
            svgr(),
            createHtmlPlugin({
                minify: true,
                inject: {
                    tags: [
                        ...(clientConfig.meta.map(meta => ({
                            ...meta,
                            injectTo: 'head',
                        })) as HtmlTagDescriptor[]),
                    ],
                },
            }),
            generateVersionPlugin(isProd ? requiresHardRefresh : false),
        ],
        build: {
            minify: isProd,
            sourcemap: isProd,
        },
        resolve: {
            alias: {
                '@/assets': path.resolve(__dirname, './assets'),
                src: path.resolve(__dirname, './src'),
                'connect-config': path.resolve(
                    __dirname,
                    './connect.config.ts',
                ),
                path: 'rollup-plugin-node-polyfills/polyfills/path',
                events: 'rollup-plugin-node-polyfills/polyfills/events',
            },
        },
    };
});
