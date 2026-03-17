import { lt } from "semver";
import { MINIMUM_NODE_VERSION } from "./constants.js";

export class NodeVersionError extends Error {
  constructor(currentVersion: string, minimumVersion: string) {
    super(
      `Node version ${minimumVersion} or higher is required. Current version: ${currentVersion}`,
    );
    this.name = "NodeVersionError";
  }

  static isError(error: unknown): error is NodeVersionError {
    return error instanceof Error && error.name === "NodeVersionError";
  }
}

export function assertNodeVersion(nodeVersion = process.versions.node) {
  if (!nodeVersion) return;

  if (lt(nodeVersion, MINIMUM_NODE_VERSION)) {
    throw new NodeVersionError(nodeVersion, MINIMUM_NODE_VERSION);
  }
}
