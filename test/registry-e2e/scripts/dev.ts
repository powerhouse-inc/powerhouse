// The same visibility and listing checks against the shared dev registry, read
// through its public URL only; every package published is unpublished at the end.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { packageList } from "./checks/package-list.js";
import { visibility } from "./checks/visibility.js";
import { hasRenownLogin, renownDir, renownToken } from "./lib/auth.js";
import { pkgPrefix, type Context } from "./lib/context.js";
import { probe, urlOf, type Target } from "./lib/poll.js";
import { setPublishLog, unpublishAll } from "./lib/publisher.js";
import {
  attempt,
  RESULTS_DIR,
  writeResult,
  type RunResult,
} from "./lib/results.js";
import { log, run } from "./lib/sh.js";
import { writeReport } from "./report.js";

const DEV_URL =
  process.env.REGISTRY_E2E_DEV_URL ?? "https://registry.dev.vetra.io";
// Two versions of the visibility package and one each of two listing packages.
const LIST_PACKAGES = 2;

async function whoami(token: string): Promise<string | undefined> {
  const res = await fetch(`${DEV_URL}/-/whoami`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return undefined;
  return ((await res.json()) as { username?: string }).username;
}

interface LokiStreams {
  data?: {
    result?: { stream: { pod?: string }; values: [string, string][] }[];
  };
}

async function lokiQuery(query: string, from: string): Promise<LokiStreams> {
  const res = await run(
    "gcx",
    ["logs", "query", query, "--from", from, "--to", "now", "--agent"],
    { allowFailure: true },
  ).catch(() => ({ code: 1, stdout: "" }));
  const line = res.stdout.split("\n").find((l) => l.includes('"status"'));
  try {
    return line ? (JSON.parse(line) as LokiStreams) : {};
  } catch {
    return {};
  }
}

// Each pod's last "warm-up done (N pkgs)": the size of its verdaccio listing.
async function podWarmCounts(from: string): Promise<Record<string, number>> {
  const streams = await lokiQuery(
    '{namespace="dev", container="registry"} |= "warm-up done"',
    from,
  );
  const counts: Record<string, number> = {};
  for (const s of streams.data?.result ?? []) {
    const last = [...s.values].sort((a, b) => a[0].localeCompare(b[0])).at(-1);
    const n = last?.[1].match(/\((\d+) pkgs\)/)?.[1];
    if (s.stream.pod && n) counts[s.stream.pod] = Number(n);
  }
  return counts;
}

if (!hasRenownLogin()) {
  console.error(
    `No Renown session in ${renownDir()}. Run \`ph login\` in its parent, or set REGISTRY_E2E_RENOWN_DIR to a .ph directory that has one.`,
  );
  process.exit(2);
}

const runId = `${Date.now()}`;
const { token, did } = await renownToken(DEV_URL);
const user = await whoami(token);
if (user !== did) {
  console.error(
    `${DEV_URL} did not accept the Renown token (whoami: ${user ?? "rejected"}). Run \`ph login\` again in ${path.dirname(renownDir())}.`,
  );
  process.exit(2);
}
log(`dev: publishing as ${did}, run ${runId}`);

const logs = path.join(RESULTS_DIR, "logs");
mkdirSync(logs, { recursive: true });
setPublishLog(path.join(logs, "publishes-dev.jsonl"));

const readers: Target[] = [
  { name: "dev", base: DEV_URL },
  // Each read gets past NGINX to whichever pod the Service picks.
  { name: "dev-nocache", base: DEV_URL, bust: true, reads: 4 },
];
const ctx: Context = {
  mode: "dev",
  label: "dev",
  runId,
  token,
  publishUrl: () => DEV_URL,
  targets: readers,
  listTargets: [readers[1]],
  timing: {
    intervalMs: 2000,
    visibleTimeoutMs: 180_000,
    holdMs: 60_000,
    latestTimeoutMs: 120_000,
    listTimeoutMs: 180_000,
  },
};
const result: RunResult = {
  mode: "dev",
  label: "dev",
  registryUrl: DEV_URL,
  auth: "renown",
  runId,
  startedAt: new Date().toISOString(),
  errors: [],
};

const prefix = pkgPrefix(runId);
const names = [
  prefix,
  ...Array.from({ length: LIST_PACKAGES }, (_, i) => `${prefix}-list${i + 1}`),
];
const before = await podWarmCounts("now-10m");
try {
  result.visibility = await attempt(result, "visibility", () =>
    visibility(ctx),
  );
  result.packageList = await attempt(result, "packageList", () =>
    packageList(ctx, LIST_PACKAGES, result.visibility ? [prefix] : []),
  );
} finally {
  result.podWarmCounts = { before, after: await podWarmCounts("now-2m") };
  // Registry log lines naming this run's packages, per pod.
  const mentions = await lokiQuery(
    `{namespace="dev", container="registry"} |= "${prefix}"`,
    "now-1h",
  );
  writeFileSync(
    path.join(logs, "dev-registry-logs.json"),
    `${JSON.stringify(mentions, null, 2)}\n`,
  );
  result.cleanup = [];
  for (const name of names) {
    const { ok } = await unpublishAll(name, DEV_URL, token);
    const after = await probe(
      urlOf({ name: "dev", base: DEV_URL, bust: true }, `/${name}`),
    );
    result.cleanup.push({ name, ok, goneAfter: after.status === 404 });
  }
  result.finishedAt = new Date().toISOString();
  log(`wrote ${writeResult("dev.json", result)}`);
  log(`wrote ${writeReport()}`);
}
