import { defineConfig } from "cypress";

export default defineConfig({
  projectId: "74d1m9",
  e2e: {
    supportFile: "cypress/support/e2e.ts",
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
  env: {
    TEST_PUBLIC_DRIVE:
      "https://apps.powerhouse.io/develop/powerhouse/switchboard/d/cypress-test",
    TEST_PUBLIC_DRIVE_NAME: "CypressTest",
  },
});
