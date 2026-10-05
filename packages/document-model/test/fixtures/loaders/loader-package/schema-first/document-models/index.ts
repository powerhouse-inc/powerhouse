import { asSchemaFirst, buildFamily } from "../../model.js";

/**
 * The schema-first twin.
 *
 * Compiled separately and then stripped of its definition, so the two
 * packages share a declaration but no object: every "the two paths observe the
 * same thing" assertion has two real sides to compare.
 */
const family = buildFamily();

export const ledgerV1 = asSchemaFirst(family.at(1));
export const ledgerV2 = asSchemaFirst(family.at(2));

export const documentModels = [ledgerV1, ledgerV2];
export const upgradeManifests = [family.upgradeManifest];

export const manifest = { name: "@powerhousedao/loader-fixture" };

/** The same null-documentModel export the code-first package carries. */
export const retiredLedger = {
  documentModel: null,
  reducer: () => undefined,
};
