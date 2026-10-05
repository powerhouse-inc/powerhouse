import { buildLedger } from "./model.js";

/** One package's manifest for `test/ledger`. */
export const ledger = buildLedger();

export const upgradeManifest = {
  documentType: "test/ledger",
  latestVersion: 1,
  supportedVersions: [1],
  upgrades: {},
};
