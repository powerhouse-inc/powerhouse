import MCR from "monocart-coverage-reports";
import coverageOptions from "./mcr.config.js";

interface GraphQLResponse {
  data?: {
    findDocuments?: {
      items?: Array<{ id: string; name: string }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

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

async function waitForDrivesReady(
  reactorPort: number,
  maxWaitMs: number = 60000,
): Promise<void> {
  const startTime = Date.now();
  // The reactor subgraph is at /graphql/r/:reactor - we use 'local' as the reactor name
  const graphqlUrl = `http://localhost:${reactorPort}/graphql/r/local`;

  console.log("⏳ Waiting for reactor drives to be ready...");

  while (Date.now() - startTime < maxWaitMs) {
    try {
      console.log(`⏳ Fetching from ${graphqlUrl}`);

      // Query for documents of type document-drive to verify the drive exists
      const response = await fetch(graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `query { findDocuments(search: { type: "powerhouse/document-drive" }) { items { id name } } }`,
        }),
      });

      const text = await response.text();
      let data: GraphQLResponse;
      try {
        data = JSON.parse(text) as GraphQLResponse;
      } catch (error) {
        console.log(
          `⏳ Response not JSON yet, error: ${error instanceof Error ? error.message : String(error)}, continuing to wait...`,
        );
        // Response not JSON yet, continue waiting
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }

      // If we get a successful response with drive documents, the drive exists
      const items = data?.data?.findDocuments?.items;
      if (items && Array.isArray(items) && items.length > 0) {
        const driveNames = items
          .map((d: { name: string }) => d.name)
          .join(", ");
        console.log(`✅ Reactor drive is ready: ${driveNames}`);
        return;
      }

      // Check for errors
      if (data?.errors) {
        // Storage errors or drive not found are transient - keep waiting
        const hasTransientError = data.errors.some(
          (e: { message?: string }) =>
            e.message?.includes("ENOENT") ||
            e.message?.includes("drive-storage") ||
            e.message?.includes("not found"),
        );
        if (!hasTransientError) {
          console.log(`⏳ GraphQL errors: ${JSON.stringify(data.errors)}`);
        }
      }
    } catch (error) {
      // GraphQL not ready yet, continue waiting
      console.log(
        `⏳ GraphQL not ready yet, error: ${error instanceof Error ? error.message : String(error)}, continuing to wait...`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // After timeout, allow tests to run anyway - they have their own timeouts
  console.log(
    "⚠️ Could not verify reactor drives within timeout, proceeding anyway...",
  );
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

    // Wait for the reactor to have drives ready (the Vetra drive should be created)
    await waitForDrivesReady(4002);

    console.log(
      "🎯 Global setup completed successfully! Both Connect and Reactor are ready.",
    );
  } catch (error) {
    console.error("❌ Failed during global setup:", error);
    throw error;
  }
}

export default globalSetup;
