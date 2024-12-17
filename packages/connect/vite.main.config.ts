import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: { minify: false, rollupOptions: { external: [''] } },
    resolve: {
        alias: {
            // src: path.resolve(__dirname, './src'),
            src: 'src',
            'connect-config': path.resolve(
                __dirname,
                './src/connect.config.ts',
            ),
        },
    },
});
