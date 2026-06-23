import { expect, reactorWorkerModeRequested, test } from "./helpers/fixtures.js";
import { DESCRIBE_TIMEOUT } from "./helpers/timeouts.js";
import { waitForAppReady } from "./helpers/wait.js";

type PhWindow = {
  ph?: { reactorClientModule?: { kind?: string } };
};

test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

test.describe("reactor worker mode", () => {
  test.skip(
    !reactorWorkerModeRequested(),
    "Only runs when PH_REACTOR_WORKER is set",
  );

  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:3001",
          localStorage: [
            { name: "/:display-cookie-banner", value: "false" },
            {
              name: "/:acceptedCookies",
              value: '{"analytics":true,"marketing":false,"functional":false}',
            },
          ],
        },
      ],
    },
  });

  test("boots the reactor inside a SharedWorker", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as PhWindow).ph?.reactorClientModule?.kind,
          ),
        { timeout: 60_000 },
      )
      .toBe("worker");
  });
});
