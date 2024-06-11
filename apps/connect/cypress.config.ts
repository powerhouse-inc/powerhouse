import { defineConfig } from 'cypress';

export default defineConfig({
    // projectId: '', // set in CI
    e2e: {
        supportFile: 'cypress/support/e2e.ts',
        setupNodeEvents(on, config) {
            // implement node event listeners here
        },
    },
});
