import type { UpgradeManifest } from "document-model";
import { v2 } from "./v2.js";
import { latestVersion, supportedVersions } from "./versions.js";

export const testEmptyCodesUpgradeManifest: UpgradeManifest<
  typeof supportedVersions
> = {
  documentType: "ph/test-empty-codes",
  latestVersion,
  supportedVersions,
  upgrades: { v2 },
};
