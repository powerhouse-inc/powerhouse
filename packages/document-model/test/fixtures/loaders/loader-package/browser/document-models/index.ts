import { buildFamily } from "../../model.js";

/**
 * The browser model subpath.
 *
 * Compiled from the same declaration as the Node entry, not re-exported from
 * it: a real package's two builds are two bundles, and the acceptance that
 * both expose identical ids, versions, specifications, action types and SDL
 * is only a claim if the two sides are distinct objects.
 */
const family = buildFamily();

export const ledgerV1 = family.at(1);
export const ledgerV2 = family.at(2);

export const documentModels = [ledgerV1, ledgerV2];
export const upgradeManifests = [family.upgradeManifest];

export const manifest = { name: "@powerhousedao/loader-fixture" };

export const retiredLedger = {
  documentModel: null,
  reducer: () => undefined,
};
