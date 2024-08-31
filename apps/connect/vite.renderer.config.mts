import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label';
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh';
import path from 'path';
import {
    HtmlTagDescriptor,
    Plugin,
    PluginOption,
    defineConfig,
    loadEnv,
} from 'vite';
import { viteEnvs } from 'vite-envs';
import { createHtmlPlugin } from 'vite-plugin-html';
import svgr from 'vite-plugin-svgr';
import pkg from './package.json';

import clientConfig from './client.config';

// Plugin to generate version.json in both dev and prod
const addToBundlePlugin = (
    file: { version: string; requiresHardRefresh?: boolean },
    basePath = '/',
): Plugin => {
    const versionManifest = {
        version: file.version,
        requiresHardRefresh: file.requiresHardRefresh || false,
    };

    console.info(versionManifest);

    return {
        name: 'add-to-bundle',

        // Hook for development mode (serves the file dynamically)
        configureServer(server) {
            // Middleware to serve version.json in dev mode
            server.middlewares.use((req, res, next) => {
                if (req.url === path.join(basePath, './version.json')) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(versionManifest, null, 2));
                } else {
                    next();
                }
            });
        },

        // Hook for production mode (writes the file to the dist folder)
        closeBundle() {
            const outputPath = path.join('dist', 'version.json');

            // Write the JSON file to the dist folder during production builds
            fs.writeFileSync(
                outputPath,
                JSON.stringify(versionManifest, null, 2),
            );
        },
    };
};

export default defineConfig(({ mode }) => {
    const isProd = mode === 'production';
    const env = loadEnv(mode, process.cwd());

    const requiresHardRefreshEnv: unknown =
        process.env.PH_CONNECT_APP_REQUIRES_HARD_REFRESH ??
        env.PH_CONNECT_APP_REQUIRES_HARD_REFRESH;

    const REQUIRES_HARD_REFRESH =
        typeof requiresHardRefreshEnv === 'boolean'
            ? requiresHardRefreshEnv
            : requiresHardRefreshEnv !== undefined
              ? requiresHardRefreshEnv === 'true'
              : isProd;

    const APP_VERSION =
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        (process.env.APP_VERSION ?? env.APP_VERSION ?? pkg.version).toString();

    const authToken = process.env.SENTRY_AUTH_TOKEN ?? env.SENTRY_AUTH_TOKEN;
    const org = process.env.SENTRY_ORG ?? env.SENTRY_ORG;
    const project = process.env.SENTRY_PROJECT ?? env.SENTRY_PROJECT;
    const release =
        (process.env.SENTRY_RELEASE ?? env.SENTRY_RELEASE) || APP_VERSION;
    const uploadSentrySourcemaps = authToken && org && project;

    const plugins: PluginOption[] = [
        react({
            include: 'src/**/*.tsx',
            babel: {
                parserOpts: {
                    plugins: ['decorators'],
                },
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
        addToBundlePlugin(
            {
                version: APP_VERSION,
                requiresHardRefresh: REQUIRES_HARD_REFRESH,
            },
            env.PH_CONNECT_ROUTER_BASENAME,
        ),
        viteEnvs({
            computedEnv() {
                return {
                    APP_VERSION,
                    REQUIRES_HARD_REFRESH,
                    SENTRY_RELEASE: release,
                };
            },
        }),
    ] as const;

    if (uploadSentrySourcemaps) {
        plugins.push(
            sentryVitePlugin({
                release: {
                    name: release,
                    inject: false, // prevent it from injecting the release id in the service worker code, this is done in 'src/app/sentry.ts' instead
                },
                authToken,
                org,
                project,
            }) as PluginOption,
        );
    }

    return {
        plugins,
        build: {
            minify: isProd,
            sourcemap: isProd,
            rollupOptions: {
                input: {
                    main: path.resolve(__dirname, 'index.html'),
                    // Adds the service worker as a separate file
                    'service-worker': path.resolve(
                        __dirname,
                        'src/service-worker.ts',
                    ),
                },
                output: {
                    // Ensure the service worker file goes to the root of the dist folder
                    entryFileNames: chunk => {
                        return ['service-worker'].includes(chunk.name)
                            ? `${chunk.name}.js`
                            : 'assets/[name].[hash].js';
                    },
                },
            },
        },
        resolve: {
            alias: {
                '@/assets': path.resolve(__dirname, './assets'),
                src: path.resolve(__dirname, './src'),
                'connect-config': path.resolve(
                    __dirname,
                    './src/connect.config.ts',
                ),
                path: 'rollup-plugin-node-polyfills/polyfills/path',
                events: 'rollup-plugin-node-polyfills/polyfills/events',
            },
        },
    };
});
