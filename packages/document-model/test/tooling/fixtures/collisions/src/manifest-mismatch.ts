import { buildLedger } from "./model.js";

export const ledger = buildLedger();

export const upgradeManifest = {
  documentType: "test/ledger",
  latestVersion: 2,
  supportedVersions: [1, 2],
  upgrades: {
    v2: { toVersion: 2, upgradeReducer: (document: unknown) => document },
  },
};
