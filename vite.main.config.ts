import path from 'path';
import { defineConfig } from 'vite';
const ASSET_URL = process.env.ASSET_URL || '';
// https://vitejs.dev/config
export default defineConfig({
    build: { minify: false, rollupOptions: { external: [''] } },
    base: `${ASSET_URL}/dist/`,
    resolve: {
        alias: {
            src: path.resolve(__dirname, './src'),
            'connect-config': path.resolve(__dirname, './connect.config.ts'),
        },
    },
});
