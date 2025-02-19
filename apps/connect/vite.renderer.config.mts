import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label';
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh';
import path from 'path';
import { HtmlTagDescriptor, PluginOption, defineConfig, loadEnv } from 'vite';
import { viteEnvs } from 'vite-envs';
import { createHtmlPlugin } from 'vite-plugin-html';
import svgr from 'vite-plugin-svgr';
import {
    viteConnectDevStudioPlugin,
    viteLoadExternalPackages,
} from '../../packages/builder-tools/dist/connect-studio/index.js';
import clientConfig from './client.config';
import pkg from './package.json';

const isBuildStudio = process.env.BUILD_STUDIO === 'true';

const reactImportScript = `
    <script type="importmap">
        {
            "imports": 
            {
                "react": "https://esm.sh/react",
                "react/": "https://esm.sh/react/",
                "react-dom": "https://esm.sh/react-dom",
                "react-dom/": "https://esm.sh/react-dom/"
            }
        }
    </script>
`;

process.env.VITE_IMPORT_REACT_SCRIPT = isBuildStudio ? '' : reactImportScript;

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
        viteConnectDevStudioPlugin(false, env),
        viteLoadExternalPackages(undefined),
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
                    entryFileNames: chunk =>
                        ['service-worker'].includes(chunk.name)
                            ? `${chunk.name}.js`
                            : 'assets/[name].[hash].js',
                },
                external: ['node:crypto'],
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
        define: {
            __APP_VERSION__: JSON.stringify(APP_VERSION),
            __REQUIRES_HARD_REFRESH__: JSON.stringify(REQUIRES_HARD_REFRESH),
        },
    };
});
