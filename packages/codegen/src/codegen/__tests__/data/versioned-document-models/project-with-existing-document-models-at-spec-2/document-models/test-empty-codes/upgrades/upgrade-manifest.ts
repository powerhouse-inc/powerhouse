import type { UpgradeManifest } from "document-model";
import { latestVersion, supportedVersions } from "./versions.js";
import { testEmptyCodesDocumentType } from "test/document-models/test-empty-codes";
import { v2 } from "./v2.js";

export const upgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: testEmptyCodesDocumentType,
  latestVersion,
  supportedVersions,
  upgrades: { v2 },
};
