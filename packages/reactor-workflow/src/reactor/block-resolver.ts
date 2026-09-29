// The one policy turning a block into the piece version that runs it.
// Rules: README, "Block resolution".
import {
  compareVersions,
  isExactVersion,
  rankClosestVersions,
  type BlockRef,
} from "@powerhousedao/pieces-framework/block-type";
import {
  isHostBound,
  npmVersions,
  registryVersions,
  unpinnedNote,
  type BlockResolution,
  type LocalPiece,
  type PieceOrigin,
  type VersionListing,
} from "../pieces/index.js";

export const ACTIVEPIECES_SCOPE = "@activepieces/";

// Tie-break order for a version more than one source holds.
const PRECEDENCE: PieceOrigin[] = ["local", "registry", "activepieces", "npm"];

export interface PieceCandidates {
  bySource: Map<PieceOrigin, string[]>;
  // Sources that could not be asked, with why.
  unreachable: string[];
}

export interface BlockResolverDeps {
  local: (name: string) => LocalPiece | undefined;
  timeoutMs?: number;
  // Whether that version has the block's action or trigger; undefined when it
  // cannot be described (running it then fails with the piece's own error).
  hasBlock?: (
    ref: BlockRef,
    version: string,
    source: PieceOrigin,
  ) => Promise<boolean | undefined>;
}

// Versions described per resolution before giving up on a block name.
export const MAX_BLOCK_LOOKUPS = 5;

const noBlock = (ref: BlockRef) => `it has no ${ref.kind} "${ref.name}"`;

function add(
  candidates: PieceCandidates,
  source: PieceOrigin,
  listing: VersionListing | undefined,
): void {
  if (!listing) return;
  if (listing.kind === "listed") {
    candidates.bySource.set(source, listing.versions);
  } else if (listing.kind === "unreachable") {
    candidates.unreachable.push(listing.detail);
  }
}

function newest(versions: Iterable<string>): string | undefined {
  let best: string | undefined;
  for (const version of versions) {
    try {
      if (!best || compareVersions(version, best) > 0) best = version;
    } catch {
      // Not semver: never a candidate.
    }
  }
  return best;
}

export class BlockResolver {
  constructor(private readonly deps: BlockResolverDeps) {}

  // Local, then the registry for names it owns, then Activepieces or npm.
  async candidates(
    piece: string,
    options: { fresh?: boolean } = {},
  ): Promise<PieceCandidates> {
    const candidates: PieceCandidates = {
      bySource: new Map(),
      unreachable: [],
    };
    const local = this.deps.local(piece);
    if (local) candidates.bySource.set("local", [local.version]);
    const listing = { timeoutMs: this.deps.timeoutMs, fresh: options.fresh };
    if (piece.startsWith(ACTIVEPIECES_SCOPE)) {
      add(candidates, "activepieces", await npmVersions(piece, listing));
      return candidates;
    }
    const registry = await registryVersions(piece, listing);
    add(candidates, "registry", registry);
    // A name the registry holds, or may hold, never comes from npm.
    if (registry === undefined || registry.kind === "absent") {
      add(candidates, "npm", await npmVersions(piece, listing));
    }
    return candidates;
  }

  // Syntax, host binding and version choice; the caller checks the name.
  // `latest` asks every source even when the installed piece is an exact match.
  async resolve(
    ref: BlockRef,
    options: { fresh?: boolean; latest?: boolean } = {},
  ): Promise<BlockResolution> {
    if (!ref.pieceName || !ref.name || !isExactVersion(ref.pieceVersion)) {
      return { requested: ref, match: "missing", note: unpinnedNote(ref) };
    }
    if (isHostBound(ref.pieceName)) return this.installed(ref);
    // Exact and local wins every tie, so no other source can change the answer.
    if (
      !options.latest &&
      this.deps.local(ref.pieceName)?.version === ref.pieceVersion &&
      (await this.deps.hasBlock?.(ref, ref.pieceVersion, "local")) !== false
    ) {
      return {
        requested: ref,
        resolved: { version: ref.pieceVersion, source: "local" },
        match: "exact",
      };
    }
    return this.choose(
      ref,
      ref.pieceVersion,
      await this.candidates(ref.pieceName, options),
    );
  }

  // For a piece named without a version (a connection check): local, else newest.
  async latest(
    piece: string,
    options: { fresh?: boolean } = {},
  ): Promise<
    | { version: string; source: PieceOrigin }
    | { version?: undefined; unreachable?: string }
  > {
    const local = this.deps.local(piece);
    if (local) return { version: local.version, source: "local" };
    const candidates = await this.candidates(piece, options);
    for (const source of PRECEDENCE) {
      const version = newest(candidates.bySource.get(source) ?? []);
      if (version) return { version, source };
    }
    return { unreachable: candidates.unreachable.join("; ") || undefined };
  }

  // A host-bound piece is the host's own code: always the installed copy.
  private async installed(ref: BlockRef): Promise<BlockResolution> {
    const local = this.deps.local(ref.pieceName);
    if (!local) {
      return {
        requested: ref,
        match: "missing",
        note: `${ref.pieceName} runs only as installed, and this reactor has not installed it`,
      };
    }
    if ((await this.deps.hasBlock?.(ref, local.version, "local")) === false) {
      return {
        requested: ref,
        match: "missing",
        note: `${ref.pieceName}@${local.version} has no ${ref.kind} "${ref.name}"`,
      };
    }
    return {
      requested: ref,
      resolved: { version: local.version, source: "local" },
      match: "installed",
      latestVersion: local.version,
      ...(local.version !== ref.pieceVersion
        ? {
            note: `Runs the installed ${local.version}; the block pins ${ref.pieceVersion}`,
          }
        : {}),
    };
  }

  // The closest version holding the block: candidates are described in
  // preference order, at most MAX_BLOCK_LOOKUPS of them.
  private async choose(
    ref: BlockRef,
    requested: string,
    candidates: PieceCandidates,
  ): Promise<BlockResolution> {
    const all = [...candidates.bySource.values()].flat();
    const latestVersion = newest(all);
    const sourceOf = (version: string) =>
      PRECEDENCE.find((source) =>
        candidates.bySource.get(source)?.includes(version),
      )!;
    const ranked = rankClosestVersions(requested, all);
    if (ranked.length === 0) {
      const unreachable = candidates.unreachable.join("; ");
      return {
        requested: ref,
        match: "missing",
        note: unreachable
          ? `No source could be asked for ${ref.pieceName}: ${unreachable}`
          : `No source has the piece ${ref.pieceName}`,
        ...(unreachable ? { unreachable } : {}),
      };
    }
    const skipped: string[] = [];
    for (const closest of ranked.slice(0, MAX_BLOCK_LOOKUPS)) {
      const source = sourceOf(closest.version);
      if (
        (await this.deps.hasBlock?.(ref, closest.version, source)) === false
      ) {
        skipped.push(`Skipped ${closest.version}: ${noBlock(ref)}`);
        continue;
      }
      const notes = [
        ...(closest.match === "exact"
          ? []
          : [
              `Pinned ${requested} is not available; runs ${closest.version} from ${source}`,
            ]),
        ...skipped,
      ];
      return {
        requested: ref,
        resolved: { version: closest.version, source },
        match: closest.match,
        ...(latestVersion ? { latestVersion } : {}),
        ...(notes.length > 0 ? { note: notes.join(". ") } : {}),
      };
    }
    const checked = ranked.slice(0, MAX_BLOCK_LOOKUPS).map((c) => c.version);
    const unchecked = ranked.length - checked.length;
    return {
      requested: ref,
      match: "missing",
      ...(latestVersion ? { latestVersion } : {}),
      note:
        checked.length === 1
          ? `${ref.pieceName}@${checked[0]} has no ${ref.kind} "${ref.name}"`
          : `${ref.pieceName} has no ${ref.kind} "${ref.name}" in ${checked.join(", ")}` +
            (unchecked > 0
              ? `; ${unchecked} more versions not checked (limit ${MAX_BLOCK_LOOKUPS})`
              : ""),
    };
  }
}
