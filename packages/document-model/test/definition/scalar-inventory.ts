import type { Sha256Digest } from "@powerhousedao/shared/document-model";
import {
  SCALAR_CATALOG_NAMES,
  scalarCatalog,
  scalarCatalogReport,
} from "../../src/definition/scalars/catalog.js";

/** The catalog's published metadata, constructed from the declarations. */
export type ScalarInventory = {
  readonly kind: "powerhouse.scalar-catalog";
  readonly formatVersion: 1;
  readonly catalogDigest: Sha256Digest;
  readonly validationProfiles: readonly string[];
  readonly names: readonly string[];
  readonly entries: readonly {
    readonly name: string;
    readonly validationProfile: string;
    readonly definitionDigest: Sha256Digest;
    readonly coercionSource: string;
  }[];
  readonly diagnostics: readonly unknown[];
};

export function scalarInventory(): ScalarInventory {
  return {
    kind: scalarCatalogReport.kind,
    formatVersion: scalarCatalogReport.formatVersion,
    catalogDigest: scalarCatalogReport.catalogDigest,
    validationProfiles: [...scalarCatalog.validationProfiles],
    names: [...SCALAR_CATALOG_NAMES],
    entries: scalarCatalogReport.entries.map((entry) => ({ ...entry })),
    diagnostics: [...scalarCatalogReport.diagnostics],
  };
}
