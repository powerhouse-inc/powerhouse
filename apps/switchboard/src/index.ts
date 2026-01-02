#!/usr/bin/env node
import { config } from "./config.js";
import { startSwitchboard } from "./server.js";

function ensureNodeVersion(minVersion = "22") {
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
ensureNodeVersion("22");

startSwitchboard(config).catch(console.error);
