import path from 'path';
import { defineConfig } from 'vite';
import { restart } from './vite-fix';

// https://vitejs.dev/config
export default defineConfig({
    build: { minify: false, rollupOptions: { external: [''] } },
    plugins: [restart()],
    resolve: {
        alias: {
            // eslint-disable-next-line no-undef
            src: path.resolve(__dirname, './src'),
        },
    },
});
