// Folds the run files in results/ into results/comparison.md, a column per run.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { FirstRead, Replacement } from "./checks/replicas.js";
import type { PollResult, SeriesSummary } from "./lib/poll.js";
import { RESULTS_DIR, type RunResult } from "./lib/results.js";

const sec = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? "never" : `${(ms / 1000).toFixed(1)}s`;

const short = (target: string) =>
  target.replace("registry-", "r").replace("-nocache", "*");

function byTarget(
  result: PollResult | null | undefined,
): Map<string, SeriesSummary[]> {
  const out = new Map<string, SeriesSummary[]>();
  for (const s of result?.series ?? []) {
    out.set(s.target, [...(out.get(s.target) ?? []), s]);
  }
  return out;
}

/** Per target: when every endpoint had been ok once. */
function lag(result: PollResult | null | undefined): string {
  if (!result) return "n/a";
  return [...byTarget(result)]
    .map(([target, series]) => {
      const all = series.every((s) => s.firstOkMs !== null);
      const ms = all ? Math.max(...series.map((s) => s.firstOkMs!)) : null;
      return `${short(target)} ${sec(ms)}`;
    })
    .join(", ");
}

/** Per target, flips summed over every phase and endpoint. */
function flips(results: (PollResult | null | undefined)[]): string {
  const perTarget = new Map<string, number>();
  for (const result of results) {
    for (const s of result?.series ?? []) {
      perTarget.set(s.target, (perTarget.get(s.target) ?? 0) + s.flips);
    }
  }
  return [...perTarget]
    .map(([target, n]) => `${short(target)} ${n}`)
    .join(", ");
}

function latest(result: PollResult | null | undefined): string {
  if (!result) return "n/a";
  return [...byTarget(result)]
    .map(([target, series]) => {
      const s = series.find((x) => x.endpoint === "latest");
      if (!s) return `${short(target)} n/a`;
      const seen = Object.keys(s.versions).join("/") || "none";
      return `${short(target)} ${sec(s.firstOkMs)} (saw ${seen})`;
    })
    .join(", ");
}

function okRate(result: PollResult | null | undefined): string {
  if (!result) return "n/a";
  return [...byTarget(result)]
    .map(([target, series]) => {
      const reads = series.reduce((n, s) => n + s.reads, 0);
      const ok = series.reduce((n, s) => n + s.okReads, 0);
      return `${short(target)} ${reads ? Math.round((100 * ok) / reads) : 0}%`;
    })
    .join(", ");
}

const read = (r: FirstRead) =>
  `${r.endpoint} ${r.status || "ERR"} ${r.ms}ms${r.version ? ` v${r.version}` : ""}`;

function replacement(r: Replacement | undefined): string {
  if (!r) return "n/a";
  return `ready ${sec(r.readyMs)}; ${r.firstReads.map(read).join("; ")}`;
}

const suffix = (name: string) =>
  name.replace(/^registry-e2e-cache-\d+-?/, "") || "vis";

function lost(run: RunResult): string {
  const list = run.packageList;
  if (!list) return "n/a";
  const parts: string[] = [];
  if (list.s3Missing) {
    const missing = list.s3Missing.map(suffix).join("/") || "none";
    parts.push(`S3 list lacks ${missing}`);
  }
  for (const s of list.series) {
    if (s.missingAtEnd.length === 0) continue;
    parts.push(
      `${short(s.target)} ${s.listing} lacks ${s.missingAtEnd.map(suffix).join("/")}`,
    );
  }
  return parts.join("; ") || "none";
}

function listed(run: RunResult): string {
  const list = run.packageList;
  if (!list) return "n/a";
  return list.series
    .map((s) => `${short(s.target)} ${s.listing} ${sec(s.completeMs)}`)
    .join(", ");
}

function owners(run: RunResult): string {
  const o = run.ownership;
  if (!o) return "n/a";
  const rows = Object.values(o.renown.owners);
  const byDid = rows.filter((r) => r?.includes(o.renown.did)).length;
  const user = o.verdaccioUser;
  return [
    `Renown: ${byDid}/${rows.length} names owned by the DID`,
    `verdaccio user: publish ${user.publishOk ? "ok" : "refused"}, row ${user.owners?.join(",") ?? "none"}, other replicas ${lag(user.visibility)}`,
    `unsigned token: publish ${o.anonymous.publishOk ? "ok" : "refused"}, row ${o.anonymous.owners ? "yes" : "none"}`,
  ].join("; ");
}

function listingsMissing(run: RunResult): string {
  const missing = run.churn?.replacement.listingsMissing;
  if (!missing) return "n/a";
  return Object.entries(missing)
    .map(([listing, names]) => `${listing} ${names.length}`)
    .join(", ");
}

function cleanup(run: RunResult): string {
  if (!run.cleanup) return "n/a";
  return run.cleanup
    .map((c) => `${suffix(c.name)} ${c.ok && c.goneAfter ? "removed" : "LEFT"}`)
    .join(", ");
}

const ROWS: [string, (run: RunResult) => string][] = [
  [
    "Ref",
    (r) =>
      r.mode === "dev" ? (r.registryUrl ?? "dev") : `${r.ref} (${r.sha})`,
  ],
  ["Auth", (r) => r.auth],
  [
    "Visibility lag, 1.0.0 (latest+exact+bundle)",
    (r) => lag(r.visibility?.first),
  ],
  ["Ok reads, 1.0.0 phase", (r) => okRate(r.visibility?.first)],
  [
    "`latest` after bump, latest reads only",
    (r) => latest(r.visibility?.latestOnly),
  ],
  ["1.0.1 once exact/bundle reads begin", (r) => lag(r.visibility?.bumped)],
  ["`latest` once exact reads ran", (r) => latest(r.visibility?.bumped)],
  ["Ok reads, 1.0.1 phase", (r) => okRate(r.visibility?.bumped)],
  [
    "404s after first 200 (flips)",
    (r) =>
      flips([
        r.visibility?.first,
        r.visibility?.latestOnly,
        r.visibility?.bumped,
      ]),
  ],
  ["Listings complete after concurrent publishes", listed],
  ["Lost packages", lost],
  [
    "Churn: ok reads elsewhere while r3 replaced",
    (r) => okRate(r.churn?.during),
  ],
  ["Churn: new r3 first reads", (r) => replacement(r.churn?.replacement)],
  ["Churn: new r3 listings missing", listingsMissing],
  ["Churn: new r3 ok reads, next 20s", (r) => okRate(r.churn?.after)],
  [
    "Cold start: first reads at once",
    (r) => replacement(r.coldStart?.immediate),
  ],
  [
    "Cold start: after /packages probe + 5s",
    (r) => replacement(r.coldStart?.afterProbe),
  ],
  ["Owner rows", owners],
  ["Clean-up", cleanup],
  [
    "Errors",
    (r) =>
      r.errors.map((e) => `${e.check}: ${e.error.slice(0, 120)}`).join("; ") ||
      "none",
  ],
];

export function writeReport(): string {
  const runs = readdirSync(RESULTS_DIR)
    .filter((f) => /^(docker-.+|dev)\.json$/.test(f))
    .sort()
    .map(
      (f) =>
        JSON.parse(
          readFileSync(path.join(RESULTS_DIR, f), "utf8"),
        ) as RunResult,
    );
  const head = runs.map((r) =>
    r.mode === "dev" ? "dev" : `Docker ${r.label}`,
  );
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const lines = [
    "# Registry cache e2e",
    "",
    "Readers: `nginx` through the cache, `nginx*`/`dev*` with a cache-busting query, `r1`-`r3` replicas direct. Times run from the publish finishing.",
    "",
    `| Metric | ${head.join(" | ")} |`,
    `| --- | ${head.map(() => "---").join(" | ")} |`,
    ...ROWS.map(
      ([name, cell]) =>
        `| ${name} | ${runs.map((r) => esc(cell(r))).join(" | ")} |`,
    ),
    "",
  ];
  const out = path.join(RESULTS_DIR, "comparison.md");
  writeFileSync(out, lines.join("\n"));
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(writeReport());
}
