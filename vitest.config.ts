import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
    test: {
        environment: 'node',
        testTimeout: 5000,
        server: {
            deps: {
                inline: ['document-model-libs']
            }
        },
        setupFiles: './test/vitest-setup.ts',
        poolOptions: {
            forks: {
                singleFork: true
            }
        }
    }
});
