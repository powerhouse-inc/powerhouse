import type { UpgradeManifest } from "document-model";
import { latestVersion, supportedVersions } from "./versions.js";

export const upgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: "ph/test-empty-codes",
  latestVersion,
  supportedVersions,
  upgrades: {},
};
