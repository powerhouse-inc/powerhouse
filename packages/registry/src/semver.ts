function splitVersion(version: string): { core: number[]; pre: string[] } {
  const withoutBuild = version.split("+", 1)[0];
  const dash = withoutBuild.indexOf("-");
  const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const pre = dash === -1 ? "" : withoutBuild.slice(dash + 1);
  return { core: core.split(".").map(Number), pre: pre ? pre.split(".") : [] };
}

const NUMERIC = /^\d+$/;

// Semver §11: numeric identifiers compare numerically and sort before
// alphanumeric ones; a shorter identifier list sorts first.
function comparePrerelease(a: string[], b: string[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    const x = a[i];
    const y = b[i];
    const xNum = NUMERIC.test(x);
    const yNum = NUMERIC.test(y);
    if (xNum && yNum) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
      continue;
    }
    if (xNum) return -1;
    if (yNum) return 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Semver sort order: negative if a < b, positive if a > b, 0 if equal. */
export function compareSemver(a: string, b: string): number {
  const va = splitVersion(a);
  const vb = splitVersion(b);
  for (let i = 0; i < Math.max(va.core.length, vb.core.length); i++) {
    const na = va.core[i] ?? 0;
    const nb = vb.core[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  // A release sorts after its prereleases.
  if (va.pre.length === 0 && vb.pre.length > 0) return 1;
  if (va.pre.length > 0 && vb.pre.length === 0) return -1;
  return comparePrerelease(va.pre, vb.pre);
}
