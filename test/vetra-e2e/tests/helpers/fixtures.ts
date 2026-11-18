import { test as testBase } from "@powerhousedao/coverage-baseline/playwright";

export { expect } from "@playwright/test";

const REACTOR_WORKER_STORAGE_KEY = "ph:reactorWorker";
const REACTOR_CLIENT_STORAGE_KEY = "ph:reactorClient";

export function reactorWorkerModeRequested(): boolean {
  const flag = process.env.PH_REACTOR_WORKER;
  return flag === "1" || flag === "true";
}

// fixtures
const test = testBase.extend<{
  reactorWorkerFlag: boolean;
}>({
  reactorWorkerFlag: [
    async ({ context }, use) => {
      const enabled = reactorWorkerModeRequested();
      if (enabled) {
        // Studio's configured remote client would otherwise win over the worker flag.
        await context.addInitScript(
          ([workerKey, clientKey]) => {
            window.localStorage.setItem(workerKey, "true");
            window.localStorage.setItem(clientKey, "worker");
          },
          [REACTOR_WORKER_STORAGE_KEY, REACTOR_CLIENT_STORAGE_KEY],
        );
      }
      await use(enabled);
    },
    {
      scope: "test",
      auto: true,
    },
  ],
});

export { test };
