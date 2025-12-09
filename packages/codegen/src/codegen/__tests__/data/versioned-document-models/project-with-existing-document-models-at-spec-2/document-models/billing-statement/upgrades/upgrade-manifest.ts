import type { UpgradeManifest } from "document-model";
import { latestVersion, supportedVersions } from "./versions.js";
import { v2 } from "./v2.js";

export const upgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: "powerhouse/billing-statement",
  latestVersion,
  supportedVersions,
  upgrades: { v2 },
};
