// Docker A/B run: per ref, build the registry, run every check on a fresh stack.
// Usage: pnpm --filter test-registry-e2e test [A=origin/main B=HEAD ...]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ownership } from "./checks/ownership.js";
import { packageList } from "./checks/package-list.js";
import { churn, coldStart } from "./checks/replicas.js";
import { visibility } from "./checks/visibility.js";
import { hasRenownLogin, renownToken, verdaccioToken } from "./lib/auth.js";
import type { Context } from "./lib/context.js";
import type { Target } from "./lib/poll.js";
import { setPublishLog } from "./lib/publisher.js";
import { registryImage } from "./lib/refs.js";
import {
  attempt,
  RESULTS_DIR,
  writeResult,
  type RunResult,
} from "./lib/results.js";
import { log } from "./lib/sh.js";
import { NGINX_URL, REPLICA_URL, REPLICAS, Stack } from "./lib/stack.js";
import { writeReport } from "./report.js";

// Renown tokens are audience-bound; the local replicas claim dev's URL.
const AUDIENCE = "https://registry.dev.vetra.io";
// Shortens every wait, for trying the harness out.
const SCALE = Number(process.env.REGISTRY_E2E_TIME_SCALE ?? 1);

function refsFromArgs(): [string, string][] {
  const args = process.argv.slice(2).filter((a) => a.includes("="));
  if (args.length === 0) {
    return [
      ["A", "origin/main"],
      ["B", "HEAD"],
    ];
  }
  return args.map((a) => a.split("=", 2) as [string, string]);
}

const targets: Target[] = [
  { name: "nginx", base: NGINX_URL },
  { name: "nginx-nocache", base: NGINX_URL, bust: true },
  ...REPLICAS.map((r) => ({ name: r, base: REPLICA_URL[r] })),
];

async function runRef(label: string, ref: string): Promise<RunResult> {
  const built = await registryImage(ref);
  const renown = hasRenownLogin();
  const stack = new Stack({ image: built.image, authRenown: renown });
  const runId = `${Date.now()}`;
  const result: RunResult = {
    mode: "docker",
    label,
    ref,
    sha: built.sha,
    image: built.image,
    auth: renown ? "renown" : "verdaccio",
    runId,
    startedAt: new Date().toISOString(),
    errors: [],
  };
  const logs = path.join(RESULTS_DIR, "logs");
  mkdirSync(logs, { recursive: true });
  setPublishLog(path.join(logs, `publishes-docker-${label}.jsonl`));
  const saveLogs = async (suffix: string) => {
    for (const service of [...REPLICAS, "nginx"]) {
      writeFileSync(
        path.join(logs, `docker-${label}-${service}${suffix}.log`),
        await stack.logs(service),
      );
    }
  };
  let logsSaved = false;
  await stack.down();
  await stack.up();
  try {
    const auth = renown
      ? await renownToken(AUDIENCE)
      : {
          token: await verdaccioToken(
            REPLICA_URL["registry-1"],
            `e2e-${runId}`,
            "pw",
          ),
          did: `e2e-${runId}`,
        };
    const ctx: Context = {
      mode: "docker",
      label,
      runId,
      token: auth.token,
      publishUrl: (i) => REPLICA_URL[REPLICAS[i % REPLICAS.length]],
      targets,
      listTargets: targets.filter((t) => t.name.startsWith("registry-")),
      timing: {
        intervalMs: 1000,
        visibleTimeoutMs: 90_000 * SCALE,
        holdMs: 20_000 * SCALE,
        latestTimeoutMs: 60_000 * SCALE,
        listTimeoutMs: 60_000 * SCALE,
      },
      stack,
    };
    const vis = await attempt(result, "visibility", () => visibility(ctx));
    result.visibility = vis;
    const published = vis ? [vis.name] : [];
    const list = await attempt(result, "packageList", () =>
      packageList(ctx, 3, published),
    );
    result.packageList = list;
    const all = [...published, ...(list?.names ?? [])];
    if (vis) {
      result.churn = await attempt(result, "churn", () =>
        churn(ctx, vis.piece, "1.0.1", all),
      );
      result.coldStart = await attempt(result, "coldStart", () =>
        coldStart(ctx, vis.piece, "1.0.1"),
      );
    }
    await saveLogs("");
    logsSaved = true;
    if (renown) {
      result.ownership = await attempt(result, "ownership", () =>
        ownership(ctx, all, auth.did),
      );
    }
  } finally {
    await saveLogs(logsSaved ? "-verdaccio-auth" : "");
    result.finishedAt = new Date().toISOString();
    log(`wrote ${writeResult(`docker-${label}.json`, result)}`);
    if (!process.env.REGISTRY_E2E_KEEP) await stack.down();
  }
  return result;
}

for (const [label, ref] of refsFromArgs()) {
  log(`=== ${label}: ${ref} ===`);
  await runRef(label, ref);
}
log(`wrote ${writeReport()}`);
