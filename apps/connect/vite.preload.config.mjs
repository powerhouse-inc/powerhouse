import { defineConfig } from 'vite';
import { restart } from "./vite-fix"

// https://vitejs.dev/config
export default defineConfig({
    plugins: [restart()],
});
