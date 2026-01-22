import { MINIMUM_NODE_VERSION } from "./constants.js";

export function assertNodeVersion() {
  const nodeVersion = Number(process.versions.node);
  if (!isNaN(nodeVersion) && nodeVersion < MINIMUM_NODE_VERSION) {
    throw new Error(
      `Node version ${MINIMUM_NODE_VERSION} or higher is required. Current version: ${nodeVersion}`,
    );
  }
}
