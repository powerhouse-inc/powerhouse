import { buildLedger } from "./model.js";

/**
 * A hand-written manifest claiming a version the selected modules do not
 * publish. A package like this looks upgradeable along a path no module
 * implements.
 */
export const ledger = buildLedger();

export const upgradeManifest = {
  documentType: "test/ledger",
  latestVersion: 2,
  supportedVersions: [1, 2],
  upgrades: {
    v2: {
      toVersion: 2,
      description: "",
      upgradeReducer: (document: unknown) => document,
    },
  },
};
