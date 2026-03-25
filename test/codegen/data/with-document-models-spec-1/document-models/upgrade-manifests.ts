import type { UpgradeManifest } from "document-model";
import { billingStatementUpgradeManifest } from "./billing-statement/upgrades/upgrade-manifest.js";
import { testDocUpgradeManifest } from "./test-doc/upgrades/upgrade-manifest.js";

export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [
  billingStatementUpgradeManifest,
  testDocUpgradeManifest,
];
