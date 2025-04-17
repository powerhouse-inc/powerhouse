import {
    externalIds,
    generateImportMapPlugin,
    viteConnectDevStudioPlugin,
    viteLoadExternalPackages,
} from '@powerhousedao/builder-tools/connect-studio';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label';
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh';
import path from 'node:path';
import {
    defineConfig,
    HtmlTagDescriptor,
    loadEnv,
    type PluginOption,
} from 'vite';
import { viteEnvs } from 'vite-envs';
import { createHtmlPlugin } from 'vite-plugin-html';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';
import clientConfig from './client.config.js';
import pkg from './package.json' with { type: 'json' };

const staticFiles = [
    './src/service-worker.ts',
    './src/external-packages.js',
    './src/hmr.ts',
];
const staticInputs = staticFiles.reduce(
    (acc, file) =>
        Object.assign(acc, {
            [path.basename(file, path.extname(file))]: path.resolve(
                __dirname,
                file,
            ),
        }),
    {},
);
const externalAndExclude = [
    'vite',
    'vite-envs',
    'node:crypto',
    '@electric-sql/pglite',
];

export default defineConfig(({ mode }) => {
    const outDir = path.resolve(__dirname, './dist');
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

    const phPackagesStr = process.env.PH_PACKAGES ?? env.PH_PACKAGES;
    const phPackages = phPackagesStr?.split(',') || [];

    const plugins: PluginOption[] = [
        nodeResolve(),
        tailwind(),
        nodePolyfills({
            include: ['events'],
            globals: {
                Buffer: false,
                global: false,
                process: true,
            },
        }),
        viteConnectDevStudioPlugin(false, outDir, env),
        viteLoadExternalPackages(
            false,
            phPackages,
            path.resolve(__dirname, './src'),
        ),
        tsconfigPaths(),
        react({
            include: './src/**/*.tsx',
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

    if (isProd) {
        plugins.push(
            generateImportMapPlugin(outDir, [
                { name: 'react', provider: 'esm.sh' },
                { name: 'react-dom', provider: 'esm.sh' },
            ]),
        );
    }

    return {
        plugins,
        build: {
            minify: false,
            sourcemap: true,
            rollupOptions: {
                input: {
                    main: path.resolve(__dirname, 'index.html'),
                    ...staticInputs,
                },
                output: {
                    entryFileNames: chunk =>
                        Object.keys(staticInputs).includes(chunk.name)
                            ? `${chunk.name}.js`
                            : 'assets/[name].[hash].js',
                },
                external: [...externalAndExclude, ...externalIds],
            },
        },
        optimizeDeps: {
            include: ['did-key-creator'],
            exclude: externalAndExclude,
        },
        define: {
            __APP_VERSION__: JSON.stringify(APP_VERSION),
            __REQUIRES_HARD_REFRESH__: JSON.stringify(REQUIRES_HARD_REFRESH),
            ...(mode !== 'development' && {
                'import.meta.hot': 'import.meta.hot',
            }),
        },
    };
});
