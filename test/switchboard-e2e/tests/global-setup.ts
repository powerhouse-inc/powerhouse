/**
 * Global setup for Switchboard E2E tests
 * 
 * IMPORTANT: This setup only WAITS for Switchboard - it doesn't start it!
 * 
 * To start Switchboard manually (required), run:
 *   cd test/switchboard-e2e
 *   pnpm vetra:switchboard
 * 
 * This starts the reactor with ph-cli vetra --disable-connect on port 4001.
 * Then run tests in a separate terminal with: pnpm test
 */

async function waitForSwitchboard(
  port: number = 4001,
  maxWaitMs: number = 10000, // 10 seconds
): Promise<void> {
  const startTime = Date.now();
  const url = `http://localhost:${port}/graphql`;

  console.log(`⏳ Checking if Switchboard is running on port ${port}...`);

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
      });

      if (response.ok) {
        console.log(`✅ Switchboard is running on port ${port}!`);
        return;
      }
    } catch (error) {
      // Not ready yet, continue waiting
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `❌ Switchboard is not running on port ${port}!\n\n` +
    `   Please start Switchboard manually before running tests:\n` +
    `   \n` +
    `   cd test/switchboard-e2e\n` +
    `   pnpm vetra:switchboard\n` +
    `   \n` +
    `   Then run tests in a separate terminal:\n` +
    `   pnpm test\n`
  );
}

export async function setup() {
  console.log("🚀 Switchboard E2E Tests - Global Setup");
  console.log("");

  try {
    // Just verify that Switchboard is already running
    await waitForSwitchboard();
    
    console.log("");
    console.log("✅ Test environment ready!");
    console.log(`   GraphQL endpoint: http://localhost:4001/graphql`);
    console.log("");
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function teardown() {
  console.log("");
  console.log("✅ Tests complete!");
  console.log("   (Switchboard left running for next test run)");
  console.log("");
}
