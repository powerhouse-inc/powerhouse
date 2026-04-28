// Real-backend pinning harness for switchboard-lb.
//
// Drives K synthetic document keys × M repeats through the LB and asserts:
//   1. Pinning      — every request for a given documentIdentifier lands on
//                     the same backend (X-LB-Upstream observed).
//   2. Distribution — across K keys, more than one backend is hit (otherwise
//                     the hash is collapsing or only one peer is up).
//
// What it does NOT do, and why: full document-state consistency (write +
// read-back equal) is intentionally out of scope here. The published
// switchboard image (`@powerhousedao/switchboard@latest`, baked into
// docker/Dockerfile --target switchboard) lags the in-repo schema and does
// not export `mutateDocument` / `createEmptyDocument` / `document(identifier:)`,
// so end-to-end document round-trips through that image fail at the
// switchboard's GraphQL layer, not at the LB. The LB-level invariant we care
// about — same documentIdentifier ⇒ same backend, distinct identifiers ⇒
// load distributes — is observable purely from the response header. When the
// switchboard image catches up, extending this script to write + read back
// is straightforward (LoadBalancerClient already has the helpers wired).
//
// Pre-req: the real-backend stack is up. From apps/switchboard-lb:
//   docker compose -f docker-compose.yml -f docker-compose.real.yml up -d --build
//
// Run:    pnpm --filter @powerhousedao/lb-loadtest verify
//         (override defaults: --url ... --docs N --mutations M)

interface Args {
  url: string;
  healthUrl: string;
  docs: number;
  mutations: number;
  timeoutMs: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    url: "http://localhost:8080/graphql",
    healthUrl: "http://localhost:8080/health",
    docs: 20,
    mutations: 10,
    timeoutMs: 60_000,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--url" && next) {
      out.url = next;
      out.healthUrl = next.replace(/\/graphql$/, "/health");
      i++;
    } else if (a === "--health-url" && next) {
      out.healthUrl = next;
      i++;
    } else if (a === "--docs" && next) {
      out.docs = Number(next);
      i++;
    } else if (a === "--mutations" && next) {
      out.mutations = Number(next);
      i++;
    } else if (a === "--timeout-ms" && next) {
      out.timeoutMs = Number(next);
      i++;
    } else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: tsx src/run.ts [--url URL] [--health-url URL] [--docs K] [--mutations M] [--timeout-ms N]",
      );
      process.exit(0);
    }
  }
  return out;
}

class LoadBalancerClient {
  constructor(private url: string) {}

  // Fires the request and returns the X-LB-Upstream the LB stamped on the
  // response. Tolerates non-2xx and GraphQL errors — what we measure is
  // *which backend the LB chose*, not whether the backend's response is
  // semantically valid.
  async probe(documentIdentifier: string): Promise<{
    backend: string | null;
    httpStatus: number;
  }> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query Probe($documentIdentifier: String!) { __typename }`,
        variables: { documentIdentifier },
      }),
    });
    // Drain the body so the connection can be reused (keepalive).
    await response.text();
    return {
      backend: response.headers.get("x-lb-upstream"),
      httpStatus: response.status,
    };
  }
}

async function retryUntilOk<T>(
  fn: () => Promise<T>,
  opts: { timeoutMs: number; label: string },
): Promise<T> {
  const start = Date.now();
  let lastErr: unknown;
  let attempt = 0;
  while (Date.now() - start < opts.timeoutMs) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === 1 || attempt % 5 === 0) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(
          `[wait] ${opts.label} not ready yet (attempt ${attempt}): ${msg}`,
        );
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(
    `${opts.label} did not become ready within ${opts.timeoutMs}ms: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

function fail(msg: string): never {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log(
    `[harness] url=${args.url} docs=${args.docs} mutations=${args.mutations}`,
  );

  // 1. Wait until the LB itself is responding.
  await retryUntilOk(
    async () => {
      const r = await fetch(args.healthUrl);
      if (!r.ok) throw new Error(`health: HTTP ${r.status}`);
    },
    { timeoutMs: args.timeoutMs, label: "switchboard-lb /health" },
  );
  console.log(`[ready] LB health 200`);

  // 2. K synthetic document identifiers — the harness owns these strings;
  // their values are irrelevant to the LB beyond being the input to the
  // consistent-hash function. Mixed prefix + index so the hash buckets
  // them across the ring rather than clustering.
  const lb = new LoadBalancerClient(args.url);
  const keys: string[] = [];
  for (let i = 0; i < args.docs; i++) {
    keys.push(`harness-doc-${i.toString().padStart(4, "0")}-${process.pid}`);
  }

  // 3. For each key, send M probes; capture X-LB-Upstream per response.
  const observations = new Map<string, Set<string>>();
  let missingHeader = 0;
  for (const key of keys) {
    observations.set(key, new Set());
    for (let j = 0; j < args.mutations; j++) {
      const { backend, httpStatus } = await lb.probe(key);
      if (!backend || backend === "" || backend === "-") {
        // Empty $upstream_addr → request never reached an upstream (e.g.
        // 503 from @no_backend, or a Lua-rejected 400/409). The harness's
        // request shape passes route.lua, so this would be a regression.
        missingHeader++;
        if (missingHeader <= 5) {
          console.error(
            `  key=${key} iter=${j}: missing X-LB-Upstream (status=${httpStatus})`,
          );
        }
        continue;
      }
      observations.get(key)!.add(backend);
    }
  }
  if (missingHeader > 0) {
    fail(
      `${missingHeader}/${keys.length * args.mutations} probes returned no X-LB-Upstream — LB image stale or routes.conf regressed`,
    );
  }
  console.log(
    `[load] ${keys.length} keys × ${args.mutations} probes = ${
      keys.length * args.mutations
    } observations`,
  );

  // 4. Pinning: every key must have observed exactly 1 backend.
  const violations = [...observations].filter(([, set]) => set.size !== 1);
  if (violations.length > 0) {
    for (const [k, set] of violations) {
      console.error(`  key=${k} hit ${[...set].join(", ")}`);
    }
    fail(`pinning violated for ${violations.length}/${keys.length} keys`);
  }

  // 5. Distribution: across keys, > 1 backend.
  const allBackends = new Set(
    [...observations.values()].flatMap((s) => [...s]),
  );
  if (allBackends.size < 2) {
    fail(
      `distribution failed — all ${keys.length} keys hashed to a single backend (${[...allBackends][0] ?? "none"})`,
    );
  }

  // 6. Per-backend tally for the operator-visible summary.
  const tally = new Map<string, number>();
  for (const set of observations.values()) {
    for (const b of set) tally.set(b, (tally.get(b) ?? 0) + 1);
  }
  const tallyStr = [...tally.entries()].map(([b, n]) => `${b}=${n}`).join(", ");
  console.log(
    `[pin]  every key pinned; ${allBackends.size} backends used (${tallyStr})`,
  );
  console.log(
    `PASS  ${keys.length} keys × ${args.mutations} probes; pinning + distribution OK`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
