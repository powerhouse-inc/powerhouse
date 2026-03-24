import type { UpgradeManifest } from "document-model";
import { latestVersion, supportedVersions } from "./versions.js";

export const billingStatementUpgradeManifest: UpgradeManifest<
  typeof supportedVersions
> = {
  documentType: "powerhouse/billing-statement",
  latestVersion,
  supportedVersions,
  upgrades: {},
};
