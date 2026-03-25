import type { UpgradeManifest } from "document-model";
import { latestVersion, supportedVersions } from "./versions.js";

export const testDocUpgradeManifest: UpgradeManifest<typeof supportedVersions> =
  {
    documentType: "powerhouse/test-doc",
    latestVersion,
    supportedVersions,
    upgrades: {},
  };
