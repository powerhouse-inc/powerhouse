import { documentModelDocumentModelModule } from "document-model";
import { randomUUID } from "node:crypto";

interface Args {
  url: string;
  healthUrl: string;
  durationSec: number;
  concurrency: number;
  rateRps: number;
  actions: number;
  createWeight: number;
  mutateWeight: number;
  readWeight: number;
  progressIntervalMs: number;
  requestTimeoutMs: number;
  timeoutMs: number;
  skipSchemaPreflight: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    url: "http://localhost:8080/graphql",
    healthUrl: "http://localhost:8080/health",
    durationSec: 60,
    concurrency: 50,
    rateRps: 0,
    actions: 1,
    createWeight: 10,
    mutateWeight: 30,
    readWeight: 60,
    progressIntervalMs: 5000,
    requestTimeoutMs: 30_000,
    timeoutMs: 60_000,
    skipSchemaPreflight: false,
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
    } else if (a === "--duration-sec" && next) {
      out.durationSec = Number(next);
      i++;
    } else if (a === "--concurrency" && next) {
      out.concurrency = Number(next);
      i++;
    } else if (a === "--rate-rps" && next) {
      out.rateRps = Number(next);
      i++;
    } else if (a === "--actions" && next) {
      out.actions = Number(next);
      i++;
    } else if (a === "--create-weight" && next) {
      out.createWeight = Number(next);
      i++;
    } else if (a === "--mutate-weight" && next) {
      out.mutateWeight = Number(next);
      i++;
    } else if (a === "--read-weight" && next) {
      out.readWeight = Number(next);
      i++;
    } else if (a === "--progress-interval-ms" && next) {
      out.progressIntervalMs = Number(next);
      i++;
    } else if (a === "--request-timeout-ms" && next) {
      out.requestTimeoutMs = Number(next);
      i++;
    } else if (a === "--timeout-ms" && next) {
      out.timeoutMs = Number(next);
      i++;
    } else if (a === "--skip-schema-preflight") {
      out.skipSchemaPreflight = true;
    } else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: tsx src/run.ts " +
          "[--url URL] [--health-url URL] " +
          "[--duration-sec N] [--concurrency N] [--rate-rps N] " +
          "[--actions M] " +
          "[--create-weight N] [--mutate-weight N] [--read-weight N] " +
          "[--progress-interval-ms N] [--request-timeout-ms N] " +
          "[--timeout-ms N] [--skip-schema-preflight]",
      );
      process.exit(0);
    }
  }
  return out;
}

const SCHEMA_PREFLIGHT_QUERY = `
  query SchemaCheck {
    __schema {
      mutationType { fields { name } }
      queryType    { fields { name } }
    }
  }
`;

const CREATE_DOCUMENT_MUTATION = `
  mutation CreateDocument($document: JSONObject!) {
    createDocument(document: $document) {
      id
      documentType
    }
  }
`;

const MUTATE_DOCUMENT_MUTATION = `
  mutation MutateDocument($documentIdentifier: String!, $actions: [JSONObject!]!) {
    mutateDocument(documentIdentifier: $documentIdentifier, actions: $actions) {
      id
      state
      revisionsList { scope revision }
    }
  }
`;

const READ_DOCUMENT_QUERY = `
  query ReadDocument($identifier: String!) {
    document(identifier: $identifier) {
      document {
        id
        state
        revisionsList { scope revision }
      }
    }
  }
`;

interface GqlResponse {
  data: unknown;
  errors?: Array<{ message: string }>;
  backend: string | null;
  status: number;
  transportError?: string;
}

class LbClient {
  constructor(
    private url: string,
    private timeoutMs: number,
  ) {}

  async post(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<GqlResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const r = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      const text = await r.text();
      let parsed: { data?: unknown; errors?: Array<{ message: string }> };
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        parsed = {};
      }
      return {
        data: parsed.data,
        errors: parsed.errors,
        backend: r.headers.get("x-lb-upstream"),
        status: r.status,
      };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        data: undefined,
        errors: undefined,
        backend: null,
        status: 0,
        transportError: aborted
          ? `timeout after ${this.timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
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

function buildSetModelNameAction(name: string): Record<string, unknown> {
  return {
    id: randomUUID(),
    type: "SET_MODEL_NAME",
    scope: "global",
    timestampUtcMs: new Date().toISOString(),
    input: { name },
  };
}

async function schemaPreflight(lb: LbClient): Promise<void> {
  const resp = await lb.post(SCHEMA_PREFLIGHT_QUERY, {
    documentIdentifier: "schema-preflight",
  });
  if (resp.transportError) {
    fail(`schema preflight transport error: ${resp.transportError}`);
  }
  if (resp.status !== 200 || resp.errors?.length) {
    fail(
      `schema preflight failed (status=${resp.status}): ${
        resp.errors?.map((e) => e.message).join("; ") ?? "no body"
      }`,
    );
  }
  const schema = (
    resp.data as {
      __schema?: {
        mutationType?: { fields?: Array<{ name: string }> };
        queryType?: { fields?: Array<{ name: string }> };
      };
    }
  )?.__schema;
  const mutationNames = new Set(
    schema?.mutationType?.fields?.map((f) => f.name) ?? [],
  );
  const queryNames = new Set(
    schema?.queryType?.fields?.map((f) => f.name) ?? [],
  );
  const missingMutations = ["createDocument", "mutateDocument"].filter(
    (n) => !mutationNames.has(n),
  );
  const missingQueries = ["document"].filter((n) => !queryNames.has(n));
  if (missingMutations.length || missingQueries.length) {
    fail(
      `switchboard image stale; expected 6.0.0-dev.202+; missing ` +
        `mutations=[${missingMutations.join(",")}] queries=[${missingQueries.join(",")}]`,
    );
  }
}

interface DocState {
  id: string;
  state: { global?: { name?: string } };
  revisionsList: Array<{ scope: string; revision: number }>;
}

interface PoolDoc {
  K: string;
  createBackend: string;
}

class Pool {
  private docs: PoolDoc[] = [];
  add(d: PoolDoc): void {
    this.docs.push(d);
  }
  pickRandom(): PoolDoc | undefined {
    const len = this.docs.length;
    if (len === 0) return undefined;
    return this.docs[Math.floor(Math.random() * len)];
  }
  size(): number {
    return this.docs.length;
  }
}

type OpType = "create" | "mutate" | "read";

class MixSampler {
  private cumulative: Array<{ type: OpType; threshold: number }>;
  private total: number;
  constructor(weights: { create: number; mutate: number; read: number }) {
    const c = Math.max(0, weights.create);
    const m = Math.max(0, weights.mutate);
    const r = Math.max(0, weights.read);
    const total = c + m + r;
    if (total <= 0) {
      throw new Error(
        "at least one of --create-weight/--mutate-weight/--read-weight must be > 0",
      );
    }
    this.total = total;
    this.cumulative = [
      { type: "create", threshold: c },
      { type: "mutate", threshold: c + m },
      { type: "read", threshold: c + m + r },
    ];
  }
  pick(): OpType {
    const r = Math.random() * this.total;
    for (const { type, threshold } of this.cumulative) {
      if (r < threshold) return type;
    }
    return "read";
  }
}

class RateGate {
  private nextSlotMs: number;
  private intervalMs: number;
  constructor(rateRps: number) {
    this.intervalMs = rateRps > 0 ? 1000 / rateRps : 0;
    this.nextSlotMs = Date.now();
  }
  async acquire(): Promise<void> {
    if (this.intervalMs === 0) return;
    const slot = this.nextSlotMs;
    this.nextSlotMs += this.intervalMs;
    const wait = slot - Date.now();
    if (wait > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
    }
  }
}

class Aggregate {
  startMs = Date.now();
  byType = {
    create: { ok: 0, fail: 0 },
    mutate: { ok: 0, fail: 0 },
    read: { ok: 0, fail: 0 },
  };
  backendTally = new Map<string, number>();
  failures = new Map<string, { count: number; samples: string[] }>();

  recordSuccess(type: OpType, backend: string): void {
    this.byType[type].ok++;
    this.backendTally.set(backend, (this.backendTally.get(backend) ?? 0) + 1);
  }

  recordFailure(type: OpType, kind: string, detail: string): void {
    this.byType[type].fail++;
    const bucket = this.failures.get(kind) ?? { count: 0, samples: [] };
    bucket.count++;
    if (bucket.samples.length < 5) bucket.samples.push(detail);
    this.failures.set(kind, bucket);
  }

  totalOps(): number {
    const t = this.byType;
    return (
      t.create.ok +
      t.create.fail +
      t.mutate.ok +
      t.mutate.fail +
      t.read.ok +
      t.read.fail
    );
  }

  totalOk(): number {
    const t = this.byType;
    return t.create.ok + t.mutate.ok + t.read.ok;
  }

  totalFailures(): number {
    const t = this.byType;
    return t.create.fail + t.mutate.fail + t.read.fail;
  }

  printProgress(poolSize: number): void {
    const elapsedSec = (Date.now() - this.startMs) / 1000;
    const ops = this.totalOps();
    const rate = elapsedSec > 0 ? (ops / elapsedSec).toFixed(1) : "0.0";
    console.log(
      `[t=${elapsedSec.toFixed(1)}s] ops=${ops} (${rate}/s) ok=${this.totalOk()} fail=${this.totalFailures()} pool=${poolSize}`,
    );
  }

  printSummary(): void {
    const elapsedSec = (Date.now() - this.startMs) / 1000;
    const ops = this.totalOps();
    const rate = elapsedSec > 0 ? (ops / elapsedSec).toFixed(1) : "0.0";
    const t = this.byType;
    console.log(
      `[summary] duration=${elapsedSec.toFixed(1)}s ops=${ops} throughput=${rate}/s ok=${this.totalOk()} fail=${this.totalFailures()}`,
    );
    console.log(
      `[mix] create=${t.create.ok + t.create.fail} mutate=${t.mutate.ok + t.mutate.fail} read=${t.read.ok + t.read.fail}`,
    );
    if (this.backendTally.size > 0) {
      const dist = [...this.backendTally.entries()]
        .sort()
        .map(([b, n]) => `${b}=${n}`)
        .join("  ");
      console.log(`[dist] ${dist}`);
    }
    if (this.failures.size > 0) {
      console.log(`[failures]`);
      const sorted = [...this.failures.entries()].sort(
        (a, b) => b[1].count - a[1].count,
      );
      for (const [kind, { count, samples }] of sorted) {
        console.log(`  ${kind} (${count}):`);
        for (const s of samples) {
          console.log(`    ${s}`);
        }
      }
    }
    if (this.totalFailures() > 0) {
      console.log(
        `FAIL  ${this.totalFailures()} consistency failure(s) across ${ops} ops`,
      );
    } else {
      console.log(`PASS  ${ops} ops, all consistency checks held`);
    }
  }
}

async function runCreate(
  lb: LbClient,
  pool: Pool,
  agg: Aggregate,
): Promise<void> {
  const K = randomUUID();
  const doc = documentModelDocumentModelModule.utils.createDocument();
  doc.header.id = K;

  const resp = await lb.post(CREATE_DOCUMENT_MUTATION, {
    document: doc,
    documentIdentifier: K,
  });
  if (resp.transportError) {
    return agg.recordFailure(
      "create",
      "create.transport",
      `K=${K} ${resp.transportError}`,
    );
  }
  if (resp.status !== 200) {
    return agg.recordFailure(
      "create",
      "create.transport",
      `K=${K} status=${resp.status}`,
    );
  }
  if (resp.errors?.length) {
    return agg.recordFailure(
      "create",
      "create.gqlErrors",
      `K=${K} ${resp.errors.map((e) => e.message).join("; ")}`,
    );
  }
  const id = (resp.data as { createDocument?: { id?: string } })?.createDocument
    ?.id;
  if (id !== K) {
    return agg.recordFailure(
      "create",
      "create.idMismatch",
      `K=${K} returned id=${id ?? "<null>"}`,
    );
  }
  if (!resp.backend) {
    return agg.recordFailure(
      "create",
      "create.backend",
      `K=${K} no X-LB-Upstream`,
    );
  }
  pool.add({ K, createBackend: resp.backend });
  agg.recordSuccess("create", resp.backend);
}

async function runMutate(
  lb: LbClient,
  pool: Pool,
  agg: Aggregate,
  args: Args,
): Promise<void> {
  const doc = pool.pickRandom();
  if (!doc) return runCreate(lb, pool, agg);

  const namePrefix = `harness-${doc.K.slice(0, 8)}`;
  const expectedName = `${namePrefix}-${args.actions - 1}`;
  const actions: Array<Record<string, unknown>> = [];
  for (let m = 0; m < args.actions; m++) {
    actions.push(buildSetModelNameAction(`${namePrefix}-${m}`));
  }
  const resp = await lb.post(MUTATE_DOCUMENT_MUTATION, {
    documentIdentifier: doc.K,
    actions,
  });
  if (resp.transportError) {
    return agg.recordFailure(
      "mutate",
      "mutate.transport",
      `K=${doc.K} ${resp.transportError}`,
    );
  }
  if (resp.status !== 200) {
    return agg.recordFailure(
      "mutate",
      "mutate.transport",
      `K=${doc.K} status=${resp.status}`,
    );
  }
  if (resp.errors?.length) {
    return agg.recordFailure(
      "mutate",
      "mutate.gqlErrors",
      `K=${doc.K} ${resp.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (resp.backend !== doc.createBackend) {
    return agg.recordFailure(
      "mutate",
      "mutate.pin",
      `K=${doc.K} backend=${resp.backend} != createBackend=${doc.createBackend}`,
    );
  }
  const mutated = (resp.data as { mutateDocument?: DocState })?.mutateDocument;
  const name = mutated?.state?.global?.name;
  if (name !== expectedName) {
    return agg.recordFailure(
      "mutate",
      "mutate.state",
      `K=${doc.K} state.global.name=${name ?? "<null>"} expected=${expectedName}`,
    );
  }
  agg.recordSuccess("mutate", resp.backend!);
}

async function runRead(
  lb: LbClient,
  pool: Pool,
  agg: Aggregate,
): Promise<void> {
  const doc = pool.pickRandom();
  if (!doc) return runCreate(lb, pool, agg);

  const resp = await lb.post(READ_DOCUMENT_QUERY, { identifier: doc.K });
  if (resp.transportError) {
    return agg.recordFailure(
      "read",
      "read.transport",
      `K=${doc.K} ${resp.transportError}`,
    );
  }
  if (resp.status !== 200) {
    return agg.recordFailure(
      "read",
      "read.transport",
      `K=${doc.K} status=${resp.status}`,
    );
  }
  if (resp.errors?.length) {
    return agg.recordFailure(
      "read",
      "read.gqlErrors",
      `K=${doc.K} ${resp.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (resp.backend !== doc.createBackend) {
    return agg.recordFailure(
      "read",
      "read.pin",
      `K=${doc.K} backend=${resp.backend} != createBackend=${doc.createBackend}`,
    );
  }
  const read = (resp.data as { document?: { document?: DocState } })?.document
    ?.document;
  if (read?.id !== doc.K) {
    return agg.recordFailure(
      "read",
      "read.id",
      `K=${doc.K} id=${read?.id ?? "<null>"}`,
    );
  }
  agg.recordSuccess("read", resp.backend!);
}

async function runWorker(
  lb: LbClient,
  pool: Pool,
  agg: Aggregate,
  gate: RateGate,
  mix: MixSampler,
  args: Args,
  deadlineMs: number,
): Promise<void> {
  while (Date.now() < deadlineMs) {
    await gate.acquire();
    if (Date.now() >= deadlineMs) break;
    const type = mix.pick();
    if (type === "create") await runCreate(lb, pool, agg);
    else if (type === "mutate") await runMutate(lb, pool, agg, args);
    else await runRead(lb, pool, agg);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log(
    `[harness] url=${args.url} duration=${args.durationSec}s ` +
      `concurrency=${args.concurrency} ` +
      `rate=${args.rateRps > 0 ? args.rateRps + "/s" : "unlimited"} ` +
      `mix=${args.createWeight}/${args.mutateWeight}/${args.readWeight} ` +
      `actions=${args.actions}`,
  );

  await retryUntilOk(
    async () => {
      const r = await fetch(args.healthUrl);
      if (!r.ok) throw new Error(`health: HTTP ${r.status}`);
    },
    { timeoutMs: args.timeoutMs, label: "switchboard-lb /health" },
  );

  const lb = new LbClient(args.url, args.requestTimeoutMs);

  if (!args.skipSchemaPreflight) {
    await schemaPreflight(lb);
  }

  const pool = new Pool();
  const agg = new Aggregate();
  const gate = new RateGate(args.rateRps);
  const mix = new MixSampler({
    create: args.createWeight,
    mutate: args.mutateWeight,
    read: args.readWeight,
  });

  const deadlineMs = Date.now() + args.durationSec * 1000;
  const progressTimer = setInterval(
    () => agg.printProgress(pool.size()),
    args.progressIntervalMs,
  );

  await Promise.all(
    Array.from({ length: args.concurrency }, () =>
      runWorker(lb, pool, agg, gate, mix, args, deadlineMs),
    ),
  );

  clearInterval(progressTimer);
  agg.printSummary();
  process.exit(agg.totalFailures() > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
