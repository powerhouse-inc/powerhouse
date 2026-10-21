import { buildFamily } from "../model.js";

const family = buildFamily();

/**
 * The Node and Vite model subpath.
 *
 * Named top-level exports per version, because a reactor worker records an
 * `exportName` and later imports that exact property. The `documentModels` and
 * `upgradeManifests` collections are additional, not a replacement for them.
 */
export const ledgerV1 = family.at(1);
export const ledgerV2 = family.at(2);

export const documentModels = [ledgerV1, ledgerV2];
export const upgradeManifests = [family.upgradeManifest];

/** A plain object, which no path mistakes for a model. */
export const manifest = { name: "@powerhousedao/loader-fixture" };

/**
 * A model-shaped export whose `documentModel` is null.
 *
 * The loaders disagree about this one on purpose and the disagreement is
 * compatibility behaviour: the Node loader asks only whether the key is
 * present and keeps it, while the HTTP loader also requires a non-null value
 * and drops it. Every other path requires more than either. It is exported
 * without being listed in `documentModels`, so a caller reading the
 * collection never sees it.
 */
export const retiredLedger = {
  documentModel: null,
  reducer: () => undefined,
};
