#!/usr/bin/env node
import * as Sentry from "@sentry/node";
import { childLogger } from "document-model";
import { config } from "./config.js";
import { createMeterProviderFromEnv } from "./metrics.js";
import { initProfilerFromEnv } from "./profiler.js";
import { startSwitchboard } from "./server.mjs";

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

const meterProvider = createMeterProviderFromEnv({
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  OTEL_METRIC_EXPORT_INTERVAL: process.env.OTEL_METRIC_EXPORT_INTERVAL,
  OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
});

async function shutdown() {
  console.log("\nShutting down...");
  // Flush final metrics before exit. Races against a 5s deadline so an
  // unresponsive OTLP endpoint cannot exhaust terminationGracePeriodSeconds.
  await Promise.race([
    meterProvider?.shutdown().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
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

startSwitchboard({ ...config, meterProvider }).catch(console.error);
