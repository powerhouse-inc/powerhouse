/**
 * Minimal semver comparator for UI filtering.
 *
 * Returns a negative number if `a` < `b`, zero if equal, positive if
 * `a` > `b`. Semver prereleases (e.g. "1.0.0-dev.3") sort BEFORE the
 * matching release, and numeric prerelease segments sort numerically.
 *
 * Intentionally smaller/looser than full semver — invalid inputs fall back
 * to lexicographic compare, so a bad filter value won't throw.
 */
type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  pre: string | undefined;
};

function parseVersion(v: string): ParsedVersion {
  const normalized = v.replace(/^v/, "");
  const dashIdx = normalized.indexOf("-");
  const core = dashIdx === -1 ? normalized : normalized.slice(0, dashIdx);
  const pre = dashIdx === -1 ? undefined : normalized.slice(dashIdx + 1);
  const segments = core.split(".");
  const toNum = (s: string | undefined) => {
    if (s === undefined) return 0;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    major: toNum(segments[0]),
    minor: toNum(segments[1]),
    patch: toNum(segments[2]),
    pre,
  };
}

export function compareVersions(a: string, b: string): number {
  try {
    const pa = parseVersion(a);
    const pb = parseVersion(b);

    if (pa.major !== pb.major) return pa.major - pb.major;
    if (pa.minor !== pb.minor) return pa.minor - pb.minor;
    if (pa.patch !== pb.patch) return pa.patch - pb.patch;

    // Prerelease rules: no prerelease > has prerelease.
    if (pa.pre === undefined && pb.pre === undefined) return 0;
    if (pa.pre === undefined) return 1;
    if (pb.pre === undefined) return -1;

    // Compare prerelease segments. Numeric segments compare numerically;
    // mixed / string segments fall back to lexicographic. A shorter
    // prerelease list sorts before a longer one (per semver spec).
    const aSegs = pa.pre.split(".");
    const bSegs = pb.pre.split(".");
    const len = Math.min(aSegs.length, bSegs.length);
    for (let i = 0; i < len; i++) {
      const sa = aSegs[i];
      const sb = bSegs[i];
      if (sa === sb) continue;
      const na = Number.parseInt(sa, 10);
      const nb = Number.parseInt(sb, 10);
      const aIsNum = Number.isFinite(na) && String(na) === sa;
      const bIsNum = Number.isFinite(nb) && String(nb) === sb;
      if (aIsNum && bIsNum) {
        if (na !== nb) return na - nb;
      } else {
        return sa.localeCompare(sb);
      }
    }
    return aSegs.length - bSegs.length;
  } catch {
    return a.localeCompare(b);
  }
}
