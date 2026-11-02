// "Did you mean" ranking against a known set of names.

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (needle[i] === haystack[j]) i++;
  }
  return i === needle.length;
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Closest `candidates` to `query`: containment first, then edit distance. */
export function suggestNames(
  query: string,
  candidates: readonly string[],
  max = 3,
): string[] {
  const q = query.toUpperCase();
  const scored = candidates.map((name) => {
    const u = name.toUpperCase();
    if (u.includes(q) || q.includes(u)) return { name, d: 0, strong: true };
    const subsequence =
      u.length >= q.length ? isSubsequence(q, u) : isSubsequence(u, q);
    if (subsequence) {
      return { name, d: Math.abs(u.length - q.length), strong: true };
    }
    return { name, d: editDistance(q, u), strong: false };
  });
  const threshold = Math.max(3, Math.ceil(q.length * 0.6) + 3);
  return scored
    .filter((s) => s.strong || s.d <= threshold)
    .sort((a, b) => a.d - b.d || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((s) => s.name);
}

/** `Unknown <subject> "<value>".` plus a did-you-mean line and, when short, the known names. */
export function unknownValueMessage(
  subject: string,
  value: string,
  candidates: readonly string[],
  options: { knownLabel?: string; inlineLimit?: number; context?: string } = {},
): string {
  const { knownLabel, inlineLimit = 20, context } = options;
  const lines = [
    `Unknown ${subject} "${value}"${context ? ` ${context}` : ""}.`,
  ];
  const suggestions = suggestNames(value, candidates);
  if (suggestions.length > 0)
    lines.push(`Did you mean: ${suggestions.join(", ")}?`);
  if (knownLabel && candidates.length > 0 && candidates.length <= inlineLimit) {
    lines.push(`${knownLabel}: ${candidates.join(", ")}`);
  }
  return lines.join("\n");
}
