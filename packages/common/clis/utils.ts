import { gte } from "semver";
import { MINIMUM_NODE_VERSION } from "./constants.js";

export function assertNodeVersion(nodeVersion = process.versions.node) {
  if (!nodeVersion) return;

  if (gte(MINIMUM_NODE_VERSION, nodeVersion)) {
    throw new Error(
      `Node version ${MINIMUM_NODE_VERSION} or higher is required. Current version: ${nodeVersion}`,
    );
  }
}
