import MCR from "monocart-coverage-reports";
import coverageOptions from "./mcr.config.js";

async function waitForPort(
  port: number,
  maxWaitMs: number = 60000,
): Promise<void> {
  const startTime = Date.now();
  const url = `http://localhost:${port}`;

  console.log(`⏳ Waiting for port ${port} to be ready...`);

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        console.log(`✅ Port ${port} is ready!`);
        return;
      }
    } catch (error) {
      // Port not ready yet, continue waiting
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timeout waiting for port ${port} after ${maxWaitMs}ms`);
}

async function globalSetup() {
  console.log("🚀 Running global setup for vetra-e2e...");

  try {
    // Clean coverage cache
    const mcr = MCR(coverageOptions);
    mcr.cleanCache();

    // Wait for both Connect (3001) and Reactor (4002) to be ready
    // Note: webServer starts vetra, but we need to wait for both services
    await waitForPort(3001);
    await waitForPort(4002);

    console.log(
      "🎯 Global setup completed successfully! Both Connect and Reactor are ready.",
    );
  } catch (error) {
    console.error("❌ Failed during global setup:", error);
    throw error;
  }
}

export default globalSetup;
