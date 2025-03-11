import { defineConfig } from "vitest/config";
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./setupTests.js']
  },
  plugins: [react()],
});
