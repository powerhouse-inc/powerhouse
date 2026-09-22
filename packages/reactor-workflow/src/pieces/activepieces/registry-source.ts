// A Powerhouse registry as a source of pieces: where this runtime reads piece
// metadata and fetches piece code.

// It serves the same three shapes cloud.activepieces.com and its CDN do — a
// list, one piece's detail, a bundle tarball — so only the base URL differs.

// The registry is the one the host already installs packages from. A package
// installed from it ships pieces that run in the worker with the same reach, so
// a bundle fetched from it is no more trusted than one that arrived inside a
// package; the trust boundary is the registry, and it is already drawn.
import { childLogger } from "document-model";

const logger = childLogger(["workflow", "piece-registry"]);

export interface PieceRegistrySource {
  /** Origin the piece endpoints hang off, without a trailing slash. */
  baseUrl: string;
  /** The catalog, in cloud.activepieces.com's list shape. */
  catalogUrl(suggestions?: boolean): string;
  /** One piece's detail, in the shape their piece endpoint answers with. */
  pieceUrl(name: string): string;
  /** The bundle, under the filename their CDN would serve it as. */
  tarballUrl(name: string, version: string): string;
}

function source(baseUrl: string): PieceRegistrySource {
  return {
    baseUrl,
    catalogUrl: (suggestions) =>
      suggestions
        ? `${baseUrl}/pieces?suggestionType=ACTION_AND_TRIGGER`
        : `${baseUrl}/pieces`,
    // Encoded whole, slash included: a scoped name is one path segment to the
    // registry's route, not two.
    pieceUrl: (name) => `${baseUrl}/pieces/${encodeURIComponent(name)}`,
    tarballUrl: (name, version) =>
      `${baseUrl}/-/pieces/bundled/${name.replace("/", "-")}-${version}.tgz`,
  };
}

// Set by the host at composition from the registry it resolved for package
// installs; absent on a host that installs no packages from one, and nothing
// changes.
let configured: PieceRegistrySource | undefined;

export function setPieceRegistryUrl(url: string | undefined): void {
  const trimmed = url?.trim().replace(/\/+$/, "") ?? "";
  if (trimmed === "") {
    configured = undefined;
    return;
  }
  if (configured?.baseUrl === trimmed) return;
  configured = source(trimmed);
  logger.info(`Pieces may be fetched from ${configured.baseUrl}`);
}

export function pieceRegistrySource(): PieceRegistrySource | undefined {
  return configured;
}
