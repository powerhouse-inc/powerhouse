import react from '@vitejs/plugin-react';
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label';
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh';
import path from 'path';
import { HtmlTagDescriptor, defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';
import { createHtmlPlugin } from 'vite-plugin-html';

import clientConfig from './client.config';

// https://vitejs.dev/config
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
        rollupOptions: {
            output: {
                manualChunks: (id, meta) => {
                    // console.log(id);
                    if (id.includes("typescript")) {
                        console.log(meta.getModuleInfo(id)?.importers);
                    }
                    if (id.includes("document-model-libs/dist/es/editors/document-model.js")) {
                        return `document-model-libs/editors.js`
                    }
                    if (id.startsWith(path.join(__dirname, 'editors')) && id.match(/editors\/[^\/]+\/editor.tsx/)) {
                        const editorName = path.basename(path.dirname(id));
                        return `editors/${editorName}`;
                    }
                },
            }
        }
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
