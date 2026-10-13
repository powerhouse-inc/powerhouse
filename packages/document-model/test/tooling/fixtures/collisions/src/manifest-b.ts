/**
 * A second, distinct manifest claiming the same document type. Folding these
 * would let a host pick either upgrade path depending on which import landed
 * first, so both are reported.
 */
export const upgradeManifest = {
  documentType: "test/ledger",
  latestVersion: 1,
  supportedVersions: [1],
  upgrades: {},
};
