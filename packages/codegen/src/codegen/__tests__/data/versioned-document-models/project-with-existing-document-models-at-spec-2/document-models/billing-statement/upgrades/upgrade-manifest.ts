import type { UpgradeManifest } from "document-model";
import { latestVersion, supportedVersions } from "./versions.js";
import { billingStatementDocumentType } from "test/document-models/billing-statement";
import { v2 } from "./v2.js";

export const upgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: billingStatementDocumentType,
  latestVersion,
  supportedVersions,
  upgrades: { v2 },
};
