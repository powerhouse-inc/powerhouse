import path from 'path';
import { defineConfig } from 'vite';
// https://vitejs.dev/config
export default defineConfig({
    build: { minify: false, rollupOptions: { external: [''] } },
    resolve: {
        alias: {
            src: path.resolve(__dirname, './src'),
            'connect-config': path.resolve(__dirname, './connect.config.ts'),
        },
    },
});
