import type { UpgradeManifest } from "@powerhousedao/shared/document-model";
import { v2 } from "./v2.js";
import { latestVersion, supportedVersions } from "./versions.js";

export const billingStatementUpgradeManifest: UpgradeManifest<
  typeof supportedVersions
> = {
  documentType: "powerhouse/billing-statement",
  latestVersion,
  supportedVersions,
  upgrades: { v2 },
};
