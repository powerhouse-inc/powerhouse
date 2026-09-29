// What a block resolved to: the piece version that runs and where it came
// from. A version mismatch never fails; only `missing` does.
import type {
  BlockIdentity,
  BlockRef,
} from "@powerhousedao/pieces-framework/block-type";

export type PieceOrigin = "local" | "registry" | "activepieces" | "npm";

export type BlockMatch =
  | "exact"
  | "compatible"
  | "fallback"
  | "installed"
  | "missing";

export interface BlockResolution {
  requested: BlockRef;
  // No source: a caller outside a reactor, which tries every download source.
  resolved?: { version: string; source?: PieceOrigin };
  match: BlockMatch;
  // Human text for the badge; absent when the pin ran as written.
  note?: string;
  // Newest version any source offers, for "update available".
  latestVersion?: string;
  // Set when nothing resolved and a source could not be asked.
  unreachable?: string;
}

// What a step's journal row keeps of its resolution.
export interface StepPieceRecord {
  version: string;
  source?: PieceOrigin;
  match: BlockMatch;
  note?: string;
}

export function pieceRecord(
  resolution: BlockResolution | undefined,
): StepPieceRecord | undefined {
  if (!resolution?.resolved) return undefined;
  return {
    version: resolution.resolved.version,
    ...(resolution.resolved.source
      ? { source: resolution.resolved.source }
      : {}),
    match: resolution.match,
    ...(resolution.note ? { note: resolution.note } : {}),
  };
}

// How a block reads in a message: `@acme/piece-http@1.2.0 action "send"`.
export function blockLabel(block: BlockIdentity | BlockRef): string {
  const version = "pieceVersion" in block ? `@${block.pieceVersion}` : "";
  return `${block.pieceName}${version} ${block.kind} "${block.name}"`;
}

export class UnknownBlockError extends Error {
  constructor(
    block: BlockIdentity | BlockRef,
    detail = `No executor registered for ${blockLabel(block)}`,
  ) {
    super(detail);
    this.name = "UnknownBlockError";
  }
}

export function unpinnedNote(block: BlockRef): string {
  return `${block.pieceName} ${block.kind} "${block.name}" pins "${block.pieceVersion}", which is not an exact semver version`;
}

// The message a missing resolution fails with.
export function missingError(resolution: BlockResolution): Error {
  return new UnknownBlockError(resolution.requested, resolution.note);
}

const RESOLUTION = Symbol.for("reactor-workflow.block-resolution");

// A failed step still journals what it resolved to.
export function withResolution<T>(
  error: T,
  resolution: BlockResolution | undefined,
): T {
  if (resolution && error !== null && typeof error === "object") {
    (error as Record<symbol, unknown>)[RESOLUTION] = resolution;
  }
  return error;
}

export function resolutionOf(error: unknown): BlockResolution | undefined {
  if (error === null || typeof error !== "object") return undefined;
  return (error as Record<symbol, BlockResolution | undefined>)[RESOLUTION];
}
