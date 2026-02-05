import type { UpgradeManifest } from "document-model";
import { latestVersion, supportedVersions } from "./versions.js";

export const testEmptyCodesUpgradeManifest: UpgradeManifest<
  typeof supportedVersions
> = {
  documentType: "ph/test-empty-codes",
  latestVersion,
  supportedVersions,
  upgrades: {},
};
