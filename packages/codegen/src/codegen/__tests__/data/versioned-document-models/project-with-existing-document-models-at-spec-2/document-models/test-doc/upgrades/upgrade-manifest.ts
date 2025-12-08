import type { UpgradeManifest } from "document-model";
import { testDocDocumentType } from "test/document-models/test-doc";
import { latest, versions } from "../versions.js";
import { upgradeToV2 } from "./v2.js";

export const upgradeManifest: UpgradeManifest<typeof versions> = {
  documentType: testDocDocumentType,
  latestVersion: latest,
  supportedVersions: versions,
  upgrades: {
    2: upgradeToV2,
  },
};
