import type { PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = {
  testDir: "./e2e-tests",
  maxFailures: 2,
  globalSetup: require.resolve("./e2e-tests/utils/global-setup"),
};

export default config;
