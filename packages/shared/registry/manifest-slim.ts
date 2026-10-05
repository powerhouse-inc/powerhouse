// Browser-safe (no node imports): Connect's package-manager hook deep-imports
// this module, so it must not pull in the node:fs helpers that live behind
// the registry barrel.
import type { Manifest, PieceModule } from "types";

type ModuleLike = { id?: unknown; name?: unknown; documentTypes?: unknown };

const MODULE_KEYS = [
  "documentModels",
  "apps",
  "editors",
  "processors",
  "subgraphs",
] as const;

// What `ph build` adds to a piece entry, kept because a listing is how a piece
// is found before anyone installs its package. The logo and the property
// schemas live in the descriptor the entry points at, not here.
const PIECE_KEYS = ["version", "description", "bundle", "descriptor"] as const;

function slimModules(
  modules: unknown,
): { id: string; name: string; documentTypes?: string[] }[] | undefined {
  if (!Array.isArray(modules)) return undefined;
  const out: { id: string; name: string; documentTypes?: string[] }[] = [];
  for (const entry of modules) {
    if (entry === null || typeof entry !== "object") continue;
    const { id, name, documentTypes } = entry as ModuleLike;
    out.push({
      id: typeof id === "string" ? id : "",
      name: typeof name === "string" ? name : "",
      ...(Array.isArray(documentTypes)
        ? {
            documentTypes: documentTypes.filter(
              (d): d is string => typeof d === "string",
            ),
          }
        : {}),
    });
  }
  return out;
}

/**
 * Reduce a manifest to the summary fields the package-listing surfaces
 * actually consume: name, description, category, publisher, and the
 * id/name/documentTypes of each module.
 *
 * Manifests arrive from the registry as unvalidated JSON, and real-world
 * publishes have carried multi-megabyte unknown fields (e.g. an agent
 * manifest's `features` blob) that made `/packages` an 8 MB response and
 * blew the localStorage quota in Connect's package manager. Whitelisting
 * the known fields keeps listings small and drops any such junk.
 */
export function slimManifest(
  manifest: Manifest | null | undefined,
): Manifest | null {
  if (manifest === null || manifest === undefined) return null;
  if (typeof manifest !== "object") return null;
  const raw = manifest as Record<string, unknown>;

  const out: Manifest = {
    name: typeof raw.name === "string" ? raw.name : "",
  };
  if (typeof raw.description === "string") out.description = raw.description;
  if (typeof raw.category === "string") out.category = raw.category;
  if (raw.publisher !== null && typeof raw.publisher === "object") {
    const publisher = raw.publisher as { name?: unknown; url?: unknown };
    out.publisher = {
      ...(typeof publisher.name === "string" ? { name: publisher.name } : {}),
      ...(typeof publisher.url === "string" ? { url: publisher.url } : {}),
    };
  }
  for (const key of MODULE_KEYS) {
    const slimmed = slimModules(raw[key]);
    if (slimmed) out[key] = slimmed;
  }
  const pieces = slimPieces(raw.pieces);
  if (pieces) out.pieces = pieces;
  return out;
}

function slimPieces(modules: unknown): PieceModule[] | undefined {
  const slimmed = slimModules(modules);
  if (!slimmed || !Array.isArray(modules)) return slimmed;
  const entries = modules.filter(
    (entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === "object",
  );
  return slimmed.map((module, index) => {
    const piece: PieceModule = { ...module };
    for (const key of PIECE_KEYS) {
      const value = entries[index]?.[key];
      if (typeof value === "string") piece[key] = value;
    }
    return piece;
  });
}
