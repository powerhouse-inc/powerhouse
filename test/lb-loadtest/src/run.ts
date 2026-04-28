import { documentModelDocumentModelModule } from "document-model";
import { randomUUID } from "node:crypto";

interface Args {
  url: string;
  healthUrl: string;
  docs: number;
  actions: number;
  timeoutMs: number;
  skipSchemaPreflight: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    url: "http://localhost:8080/graphql",
    healthUrl: "http://localhost:8080/health",
    docs: 20,
    actions: 1,
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
    } else if (a === "--docs" && next) {
      out.docs = Number(next);
      i++;
    } else if ((a === "--actions" || a === "--mutations") && next) {
      out.actions = Number(next);
      i++;
    } else if (a === "--timeout-ms" && next) {
      out.timeoutMs = Number(next);
      i++;
    } else if (a === "--skip-schema-preflight") {
      out.skipSchemaPreflight = true;
    } else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: tsx src/run.ts [--url URL] [--health-url URL] [--docs K] " +
          "[--actions M] [--timeout-ms N] [--skip-schema-preflight]",
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
}

class LbClient {
  constructor(private url: string) {}

  async post(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<GqlResponse> {
    const r = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
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

function iterFail(i: number, k: string, step: string, detail: string): never {
  fail(`iter=${i} id=${k} step=${step}: ${detail}`);
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
  const { data, errors, status } = await lb.post(SCHEMA_PREFLIGHT_QUERY, {
    documentIdentifier: "schema-preflight",
  });
  if (status !== 200 || errors?.length) {
    fail(
      `schema preflight failed (status=${status}): ${
        errors?.map((e) => e.message).join("; ") ?? "no body"
      }`,
    );
  }
  const schema = (
    data as {
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log(
    `[harness] url=${args.url} docs=${args.docs} actions=${args.actions}`,
  );

  await retryUntilOk(
    async () => {
      const r = await fetch(args.healthUrl);
      if (!r.ok) throw new Error(`health: HTTP ${r.status}`);
    },
    { timeoutMs: args.timeoutMs, label: "switchboard-lb /health" },
  );

  const lb = new LbClient(args.url);

  if (!args.skipSchemaPreflight) {
    await schemaPreflight(lb);
  }

  const tally = new Map<string, number>();
  const backends: string[] = [];

  for (let i = 0; i < args.docs; i++) {
    const K = randomUUID();

    const doc = documentModelDocumentModelModule.utils.createDocument();
    doc.header.id = K;

    const createResp = await lb.post(CREATE_DOCUMENT_MUTATION, {
      document: doc,
      documentIdentifier: K,
    });
    if (createResp.status !== 200 || createResp.errors?.length) {
      iterFail(
        i,
        K,
        "create",
        `status=${createResp.status} errors=${
          createResp.errors?.map((e) => e.message).join("; ") ?? "none"
        }`,
      );
    }
    const createdId = (createResp.data as { createDocument?: { id?: string } })
      ?.createDocument?.id;
    if (createdId !== K) {
      iterFail(i, K, "create", `returned id=${createdId ?? "<null>"}`);
    }
    const backendCreate = createResp.backend;
    if (!backendCreate) {
      iterFail(i, K, "create", `no X-LB-Upstream`);
    }

    const namePrefix = `harness-${K.slice(0, 8)}`;
    const expectedName = `${namePrefix}-${args.actions - 1}`;
    const actions: Array<Record<string, unknown>> = [];
    for (let m = 0; m < args.actions; m++) {
      actions.push(buildSetModelNameAction(`${namePrefix}-${m}`));
    }
    const mutateResp = await lb.post(MUTATE_DOCUMENT_MUTATION, {
      documentIdentifier: K,
      actions,
    });
    if (mutateResp.status !== 200 || mutateResp.errors?.length) {
      iterFail(
        i,
        K,
        "mutate",
        `status=${mutateResp.status} errors=${
          mutateResp.errors?.map((e) => e.message).join("; ") ?? "none"
        }`,
      );
    }
    const mutated = (mutateResp.data as { mutateDocument?: DocState })
      ?.mutateDocument;
    if (mutateResp.backend !== backendCreate) {
      iterFail(
        i,
        K,
        "mutate",
        `backend=${mutateResp.backend} != create backend=${backendCreate}`,
      );
    }
    if (mutated?.state?.global?.name !== expectedName) {
      iterFail(
        i,
        K,
        "mutate",
        `state.global.name=${mutated?.state?.global?.name ?? "<null>"} expected=${expectedName}`,
      );
    }

    const readResp = await lb.post(READ_DOCUMENT_QUERY, { identifier: K });
    if (readResp.status !== 200 || readResp.errors?.length) {
      iterFail(
        i,
        K,
        "read",
        `status=${readResp.status} errors=${
          readResp.errors?.map((e) => e.message).join("; ") ?? "none"
        }`,
      );
    }
    const read = (readResp.data as { document?: { document?: DocState } })
      ?.document?.document;
    if (readResp.backend !== backendCreate) {
      iterFail(
        i,
        K,
        "read",
        `backend=${readResp.backend} != create backend=${backendCreate}`,
      );
    }
    if (read?.id !== K) {
      iterFail(i, K, "read", `id=${read?.id ?? "<null>"}`);
    }
    if (read?.state?.global?.name !== expectedName) {
      iterFail(
        i,
        K,
        "read",
        `state.global.name=${read?.state?.global?.name ?? "<null>"} expected=${expectedName}`,
      );
    }

    backends.push(backendCreate!);
    tally.set(backendCreate!, (tally.get(backendCreate!) ?? 0) + 1);
    console.log(
      `[iter ${i + 1}/${args.docs}] id=${K} backend=${backendCreate} ok`,
    );
  }

  const distinct = new Set(backends);
  if (distinct.size < 2) {
    fail(
      `distribution failed — all ${args.docs} docs hashed to one backend (${
        [...distinct][0] ?? "none"
      })`,
    );
  }

  const tallyStr = [...tally.entries()].map(([b, n]) => `${b}=${n}`).join(", ");
  console.log(`[dist] ${distinct.size} backends observed (${tallyStr})`);
  console.log(
    `PASS  ${args.docs} docs × (create+mutate+read); pinning + round-trip + distribution OK`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
