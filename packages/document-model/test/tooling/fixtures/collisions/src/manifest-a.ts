import { buildLedger } from "./model.js";

export const ledger = buildLedger();

export const upgradeManifest = {
  documentType: "test/ledger",
  latestVersion: 1,
  supportedVersions: [1],
  upgrades: {},
};
