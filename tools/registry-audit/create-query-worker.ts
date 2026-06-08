/**
 * Worker process for create-query.ts. Not a phase entry point - it is spawned by
 * create-query.ts (one per package) so a hang or hard crash is isolated to a
 * single child process. Argv[1] is the package name to exercise.
 *
 * Boots a Switchboard (in-process, in-memory PGlite) with the single named
 * package loaded, then for every document model that package CONTRIBUTES (i.e.
 * not a core/baseline model), it hits that model's own generated GraphQL
 * subgraph endpoint and:
 *   1. creates an empty document of that type (createEmptyDocument), then
 *   2. queries it back by id (document(identifier:)).
 *
 * The baseline core model ids arrive via PH_BASELINE_MODEL_IDS (JSON array) so we
 * only exercise the package's own models. The worker prints exactly one
 * machine-readable line for the parent to parse:
 *
 *   __SBCQ__ {"ok":true,"ms":1234,"models":[{...}]}
 *
 * and exits 0 on success / 1 on a boot failure.
 *
 * The Switchboard build is imported by absolute path; create-query.ts runs this
 * worker with cwd set to the package's install scaffold so the Switchboard's
 * package loader resolves the named package (and its deps) from that scaffold.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, SWITCHBOARD_SERVER } from "./lib.js";

type DocModule = {
  documentModel?: { global?: { id?: string; name?: string } };
};
type SwitchboardHandle = {
  port: number;
  reactor: {
    getDocumentModelModules: () => Promise<
      { results?: DocModule[] } | DocModule[]
    >;
  };
  shutdown: () => Promise<void>;
};
type StartSwitchboard = (
  opts: Record<string, unknown>,
) => Promise<SwitchboardHandle>;

type ModelResult = {
  /** Model id == document type, e.g. "powerhouse/builder-profile". */
  id: string;
  /** Model global name (source of the subgraph/namespace names). */
  name: string;
  /** Per-model subgraph URL segment, e.g. "powerhouse-builder-profile". */
  subgraph: string;
  created: boolean;
  queried: boolean;
  /** Set when the subgraph endpoint itself is missing (404) - likely name drift. */
  endpointMissing?: boolean;
  createError?: string;
  queryError?: string;
};

/**
 * A fixed port to bind the Switchboard on. Unlike `load`, this phase must address
 * the HTTP server, and `startSwitchboard` does not report back an OS-assigned
 * (`port: 0`) port. Workers run one at a time and fully exit between packages, so a
 * fixed port is reusable; `strictPort` makes a lingering listener a hard error
 * rather than a silent rebind we couldn't find.
 */
const PORT = 47100;

function emit(obj: unknown): void {
  console.log(`__SBCQ__ ${JSON.stringify(obj)}`);
}

/**
 * Splits an identifier into words on separators (/ space - _ .) and camel/acronym
 * boundaries - the basis for kebab/pascal casing that mirrors `change-case`, which
 * is what reactor-api uses to name each model's subgraph and GraphQL namespace.
 */
function toWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
}

/** kebabCase(name) - the subgraph URL segment (mirrors document-model-subgraph.ts). */
function kebabCase(name: string): string {
  return toWords(name)
    .map((w) => w.toLowerCase())
    .join("-");
}

/** pascalCase(name) - the GraphQL namespace type (mirrors getDocumentModelSchemaName). */
function pascalCase(name: string): string {
  return toWords(name)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

type GqlResponse = {
  httpOk: boolean;
  status: number;
  data?: Record<string, unknown>;
  errors?: { message?: string }[];
};

async function gqlFetch(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GqlResponse> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  let body: {
    data?: Record<string, unknown>;
    errors?: { message?: string }[];
  } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* non-JSON (e.g. a 404 page) - leave body empty */
  }
  return {
    httpOk: res.ok,
    status: res.status,
    data: body.data,
    errors: body.errors,
  };
}

/** Joins GraphQL error messages into a single short string. */
function errText(res: GqlResponse): string {
  if (!res.httpOk && !res.errors?.length) return `HTTP ${res.status}`;
  return (res.errors ?? [])
    .map((e) => e.message ?? "")
    .join("; ")
    .slice(0, 500);
}

async function exerciseModel(
  port: number,
  id: string,
  name: string,
): Promise<ModelResult> {
  const subgraph = kebabCase(name);
  const namespace = pascalCase(name);
  // 127.0.0.1, not "localhost": on macOS localhost can resolve to ::1 first and
  // miss an IPv4-only listener.
  const endpoint = `http://127.0.0.1:${port}/graphql/${subgraph}`;
  const result: ModelResult = {
    id,
    name,
    subgraph,
    created: false,
    queried: false,
  };

  // 1. Create an empty document of this type via the model's generated subgraph.
  const createRes = await gqlFetch(
    endpoint,
    `mutation { ${namespace} { createEmptyDocument { id name documentType } } }`,
  );
  if (createRes.status === 404) {
    result.endpointMissing = true;
    result.createError = `no subgraph at /graphql/${subgraph}`;
    return result;
  }
  const created = (
    createRes.data?.[namespace] as
      | { createEmptyDocument?: { id?: string; documentType?: string } }
      | undefined
  )?.createEmptyDocument;
  if (!created?.id) {
    result.createError = errText(createRes) || "no document id returned";
    return result;
  }
  result.created = true;
  const docId = created.id;

  // 2. Query it back by id via the same generated subgraph.
  const queryRes = await gqlFetch(
    endpoint,
    `query($id: String!) { ${namespace} { document(identifier: $id) { document { id documentType } childIds } } }`,
    { id: docId },
  );
  const fetched = (
    queryRes.data?.[namespace] as
      | { document?: { document?: { id?: string; documentType?: string } } }
      | undefined
  )?.document?.document;
  if (!fetched?.id) {
    result.queryError = errText(queryRes) || "document not found";
    return result;
  }
  if (fetched.id !== docId) {
    result.queryError = `queried id ${fetched.id} != created id ${docId}`;
    return result;
  }
  if (fetched.documentType && fetched.documentType !== id) {
    result.queryError = `documentType ${fetched.documentType} != ${id}`;
    return result;
  }
  result.queried = true;
  return result;
}

async function main(): Promise<void> {
  const ext = process.argv[2];
  if (!ext || ext === "none") {
    emit({ ok: false, models: [], error: "no package name given" });
    process.exit(1);
  }
  const baseline = new Set<string>(
    JSON.parse(process.env.PH_BASELINE_MODEL_IDS ?? "[]") as string[],
  );
  const t0 = Date.now();

  const serverUrl = pathToFileURL(SWITCHBOARD_SERVER).href;
  const mod = (await import(serverUrl)) as {
    startSwitchboard: StartSwitchboard;
  };

  const sb = await mod.startSwitchboard({
    port: PORT,
    strictPort: true,
    packages: [ext],
    disableLocalPackages: true,
    mcp: false,
    enableDocumentModelSubgraphs: true,
  });

  const res = await sb.reactor.getDocumentModelModules();
  const arr = Array.isArray(res) ? res : (res.results ?? []);
  const targets = arr
    .map((m) => ({
      id: m?.documentModel?.global?.id ?? "",
      name: m?.documentModel?.global?.name ?? "",
    }))
    .filter((m) => m.id && m.name && !baseline.has(m.id));

  const models: ModelResult[] = [];
  for (const m of targets) {
    try {
      models.push(await exerciseModel(PORT, m.id, m.name));
    } catch (e) {
      // A transport-level failure (e.g. fetch failed) is the model's result, not
      // a worker crash - record it so the other models still run.
      const msg = e instanceof Error ? e.message : String(e);
      models.push({
        id: m.id,
        name: m.name,
        subgraph: kebabCase(m.name),
        created: false,
        queried: false,
        createError: msg.slice(0, 500),
      });
    }
  }

  await sb.shutdown();
  emit({ ok: true, ms: Date.now() - t0, models });
  // Force exit: the reactor/GraphQL stack can leave timers/handles open.
  process.exit(0);
}

main().catch((e: unknown) => {
  const error = e instanceof Error ? (e.stack ?? e.message) : String(e);
  emit({ ok: false, models: [], error: error.slice(0, 2000) });
  process.exit(1);
});
