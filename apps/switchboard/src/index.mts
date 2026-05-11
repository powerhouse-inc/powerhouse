#!/usr/bin/env node
// Observability MUST load before any module that imports http/express/pg/graphql
// so OpenTelemetry's require-time hooks can patch them. It also owns Sentry
// init and the SIGINT/SIGTERM flush.
import "./observability.mjs";

import * as Sentry from "@sentry/node";
import { childLogger } from "document-model";
import { config } from "./config.js";
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

// Each subgraph registers its own SIGINT/SIGTERM listeners, and the count
// scales with dynamically-loaded document models beyond the default cap of 10.
process.setMaxListeners(0);

if (process.env.PYROSCOPE_SERVER_ADDRESS) {
  try {
    await initProfilerFromEnv(process.env);
  } catch (e) {
    Sentry.captureException(e);
    logger.error("Error starting profiler: @error", e);
  }
}

const cliMigratePglite = process.argv.slice(2).includes("--migrate-pglite");

startSwitchboard({
  ...config,
  migratePglite: cliMigratePglite || config.migratePglite,
  forcePgVersion: config.forcePgVersion ?? undefined,
}).catch(console.error);
