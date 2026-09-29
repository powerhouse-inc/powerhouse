// A block is named by its piece, the piece's exact version and the action or
// trigger name. No dependencies: the editor loads this too.

export type BlockKind = "action" | "trigger";

export interface BlockIdentity {
  pieceName: string;
  kind: BlockKind;
  /** Action or trigger name within the piece. */
  name: string;
}

export interface BlockRef extends BlockIdentity {
  /** Exact semver the workflow pins. */
  pieceVersion: string;
}

export type VersionMatch = "exact" | "compatible" | "fallback";

export interface ClosestVersion {
  version: string;
  match: VersionMatch;
}

// semver.org's reference pattern: no `v` prefix, no ranges, no dist-tags.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isExactVersion(version: string): boolean {
  return SEMVER.test(version);
}

// Version-free identity as one string, for map and cache keys.
export function blockKey(block: BlockIdentity): string {
  return `${block.pieceName} ${block.kind} ${block.name}`;
}

interface Semver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

function parseSemver(version: string): Semver {
  const match = SEMVER.exec(version);
  if (!match) throw new Error(`"${version}" is not an exact semver version`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

const NUMERIC = /^\d+$/;

function compareIdentifiers(a: string, b: string): number {
  const aNumeric = NUMERIC.test(a);
  const bNumeric = NUMERIC.test(b);
  if (aNumeric && bNumeric) return Math.sign(Number(a) - Number(b));
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// Semver 2.0 precedence: build metadata is ignored, a prerelease sorts first.
export function compareVersions(a: string, b: string): number {
  const x = parseSemver(a);
  const y = parseSemver(b);
  const core =
    Math.sign(x.major - y.major) ||
    Math.sign(x.minor - y.minor) ||
    Math.sign(x.patch - y.patch);
  if (core !== 0) return core;
  if (x.prerelease.length === 0 || y.prerelease.length === 0) {
    return Math.sign(y.prerelease.length - x.prerelease.length);
  }
  const shared = Math.min(x.prerelease.length, y.prerelease.length);
  for (let i = 0; i < shared; i++) {
    const order = compareIdentifiers(x.prerelease[i], y.prerelease[i]);
    if (order !== 0) return order;
  }
  return Math.sign(x.prerelease.length - y.prerelease.length);
}

// Compatibility line: the major, or major.minor while the major is 0.
function line(version: string): string {
  const { major, minor } = parseSemver(version);
  return major === 0 ? `0.${minor}` : `${major}`;
}

// Every available version, closest first: exact; the same line at or above
// the request, highest first; the same line below it; then the rest, highest
// first. Invalid entries are skipped.
export function rankClosestVersions(
  requested: string,
  available: readonly string[],
): ClosestVersion[] {
  const candidates = [...new Set(available.filter(isExactVersion))];
  const descending = candidates.sort((a, b) => compareVersions(b, a));
  if (!isExactVersion(requested)) {
    return descending.map((version) => ({ version, match: "fallback" }));
  }
  const wanted = line(requested);
  const rank = (version: string): [number, VersionMatch] => {
    if (version === requested) return [0, "exact"];
    if (line(version) !== wanted) return [3, "fallback"];
    return compareVersions(version, requested) >= 0
      ? [1, "compatible"]
      : [2, "fallback"];
  };
  return descending
    .map((version) => ({ version, rank: rank(version) }))
    .sort((a, b) => a.rank[0] - b.rank[0])
    .map(({ version, rank: [, match] }) => ({ version, match }));
}

export function pickClosestVersion(
  requested: string,
  available: readonly string[],
): ClosestVersion | undefined {
  return rankClosestVersions(requested, available)[0];
}
