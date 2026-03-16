#!/usr/bin/env node
import * as Sentry from "@sentry/node";
import { childLogger } from "document-drive";
import { config } from "./config.js";
import { initMetricsFromEnv } from "./metrics.js";
import { initProfilerFromEnv } from "./profiler.js";
import { startSwitchboard } from "./server.js";

const logger = childLogger(["switchboard"]);

function ensureNodeVersion(minVersion = "24") {
  const version = process.versions.node;
  if (!version) {
    return;
  }

  if (version < minVersion) {
    console.error(
      `Node version ${minVersion} or higher is required. Current version: ${version}`,
    );
    process.exit(1);
  }
}
// Ensure minimum Node.js version
ensureNodeVersion("24");

const meterProvider = initMetricsFromEnv(process.env);

async function shutdown() {
  console.log("\nShutting down...");
  // Flush final metrics before exit so the final collection pass runs
  // before the process terminates.
  await meterProvider?.shutdown().catch(() => undefined);
  process.exit(0);
}

// SIGINT: Ctrl-C in development; SIGTERM: graceful shutdown in Docker/Kubernetes
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (process.env.PYROSCOPE_SERVER_ADDRESS) {
  try {
    await initProfilerFromEnv(process.env);
  } catch (e) {
    Sentry.captureException(e);
    logger.error("Error starting profiler: @error", e);
  }
}

startSwitchboard(config).catch(console.error);
