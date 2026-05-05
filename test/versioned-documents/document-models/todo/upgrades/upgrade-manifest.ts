/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { UpgradeManifest } from "document-model";
import { v2 } from "./v2.js";
import { latestVersion, supportedVersions } from "./versions.js";

export const todoUpgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: "test/todo",
  latestVersion,
  supportedVersions,
  upgrades: { v2 },
};
