/**
 * Lists branches the suite rarely executes, as a review aid for rule R3 of
 * docs/plans/2026-10-02-testing-policy.md: a fallback branch that runs a
 * handful of times across four thousand tests, with no test asserting its
 * output, is where a silent substitution hides. Advisory only; not a gate.
 *
 * Usage, after a coverage run has written coverage/coverage-final.json:
 *
 *   pnpm exec tsx scripts/rare-branches.ts [maxHits] [pathFilter]
 *
 * maxHits defaults to 5: a branch taken 0..5 times is listed. pathFilter is
 * a substring match on the file path, e.g. "read-models".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

type BranchLocation = {
  start: { line: number };
  end: { line: number };
};

type FileCoverage = {
  path: string;
  branchMap: Record<string, { type: string; loc: BranchLocation }>;
  b: Record<string, number[]>;
};

const maxHits = Number(process.argv[2] ?? "5");
const pathFilter = process.argv[3] ?? "";

const coveragePath = join(
  import.meta.dirname,
  "..",
  "coverage",
  "coverage-final.json",
);

let raw: string;
try {
  raw = readFileSync(coveragePath, "utf8");
} catch {
  console.error(
    `No coverage data at ${coveragePath}. Run the suite with coverage first: pnpm test`,
  );
  process.exit(1);
}

const coverage = JSON.parse(raw) as Record<string, FileCoverage>;

type Finding = {
  file: string;
  line: number;
  type: string;
  arm: number;
  hits: number;
  siblingHits: number;
};

const findings: Finding[] = [];

for (const entry of Object.values(coverage)) {
  const file = entry.path.replace(/\\/g, "/");
  if (pathFilter && !file.includes(pathFilter)) continue;
  if (!file.includes("/src/")) continue;

  for (const [id, branch] of Object.entries(entry.branchMap)) {
    const counts = entry.b[id];
    if (!counts || counts.length < 2) continue;
    const total = counts.reduce((sum, n) => sum + n, 0);
    if (total === 0) continue;

    counts.forEach((hits, arm) => {
      if (hits <= maxHits) {
        findings.push({
          file,
          line: branch.loc.start.line,
          type: branch.type,
          arm,
          hits,
          siblingHits: total - hits,
        });
      }
    });
  }
}

findings.sort((a, b) => a.hits - b.hits || b.siblingHits - a.siblingHits);

if (findings.length === 0) {
  console.log(
    `No branch arm executed ${maxHits} times or fewer (filter: "${pathFilter || "src"}").`,
  );
  process.exit(0);
}

console.log(
  `Branch arms executed <= ${maxHits} times while a sibling arm ran (filter: "${pathFilter || "src"}").`,
);
console.log(
  "A high sibling count next to a near-zero arm marks a fallback the suite flows around.\n",
);
for (const finding of findings) {
  const shortFile = finding.file.replace(/^.*\/packages\/reactor\//, "");
  console.log(
    `${shortFile}:${finding.line}  ${finding.type} arm ${finding.arm}: ${finding.hits} hits (siblings: ${finding.siblingHits})`,
  );
}
console.log(
  `\n${findings.length} arms listed. Each is a candidate for policy rule R3: assert it, refuse it, or delete it.`,
);
