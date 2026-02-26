#!/usr/bin/env node
import { config } from "./config.js";
import { initProfilerFromEnv } from "./profiler.js";
import { startSwitchboard } from "./server.js";

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

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  process.exit(0);
});

if (process.env.PYROSCOPE_SERVER_ADDRESS) {
  try {
    await initProfilerFromEnv(process.env);
  } catch (e) {
    console.error("Error starting profiler:", e);
  }
}

startSwitchboard(config).catch(console.error);
