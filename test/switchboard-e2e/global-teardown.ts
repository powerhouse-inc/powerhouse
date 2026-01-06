/**
 * Global Teardown for Switchboard E2E Tests
 *
 * This runs AFTER all Playwright tests complete.
 * Use this for cleanup tasks like:
 * - Removing test data
 * - Closing connections
 * - Generating reports
 */

async function globalTeardown() {
  console.log("\n🧹 Running Switchboard E2E global teardown...\n");

  try {
    // Add any cleanup tasks here
    // For example:
    // - Clean up test drives created during tests
    // - Remove temporary files
    // - Generate coverage reports

    console.log("   ✅ Teardown completed successfully\n");
  } catch (error) {
    console.error("   ⚠️  Teardown encountered an error:", error);
    // Don't throw - we don't want teardown failures to fail the test run
  }
}

export default globalTeardown;

