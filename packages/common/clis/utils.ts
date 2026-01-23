import { gte } from "semver";
import { MINIMUM_NODE_VERSION } from "./constants.js";

export function assertNodeVersion(nodeVersion = process.versions.node) {
  if (!nodeVersion) return;

  if (gte(nodeVersion, MINIMUM_NODE_VERSION)) {
    throw new Error(
      `Node version ${MINIMUM_NODE_VERSION} or higher is required. Current version: ${nodeVersion}`,
    );
  }
}
