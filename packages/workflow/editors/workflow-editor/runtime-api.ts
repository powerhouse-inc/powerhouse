// Design-time channel to the workflow-runtime subgraph: piece descriptors
// and dynamic option resolution. Not document-model coupled.
import {
  CORE_FORMS,
  POLL_INTERVAL_PROP,
  type BlockForm,
  type BlockFormProp,
} from "./ui/forms.js";

const DEFAULT_RUNTIME_URL = "http://localhost:4001/graphql/workflow-runtime";

let currentRuntimeUrl: string | undefined;

// Set by useSyncWorkflowRuntimeUrl from the drive's resolved switchboard URL.
export function setRuntimeUrl(url: string): void {
  if (url === currentRuntimeUrl) return;
  currentRuntimeUrl = url;
  // Cached design-time results belong to the previous switchboard.
  formCache.clear();
  outputTreeCache.clear();
  catalogCache = undefined;
  connectionsCache = undefined;
}

function runtimeUrl(): string {
  return currentRuntimeUrl ?? DEFAULT_RUNTIME_URL;
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(runtimeUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  if (!body.data) throw new Error("Empty GraphQL response");
  return body.data;
}

interface BlockEntryDescriptor {
  displayName: string;
  requireAuth: boolean;
  props: BlockFormProp[];
}

interface BlockDescriptorResult {
  workflowRuntime: {
    blockDescriptor: {
      displayName: string;
      auth?: unknown;
      action?: BlockEntryDescriptor;
      trigger?: BlockEntryDescriptor;
    } | null;
  };
}

const formCache = new Map<string, Promise<BlockForm | null>>();

export function getBlockForm(blockType: string): Promise<BlockForm | null> {
  const core = CORE_FORMS[blockType] as BlockForm | undefined;
  if (core) return Promise.resolve(core);
  let cached = formCache.get(blockType);
  if (!cached) {
    cached = gql<BlockDescriptorResult>(
      `query Descriptor($blockType: String!) {
        workflowRuntime { blockDescriptor(blockType: $blockType) }
      }`,
      { blockType },
    ).then((data) => {
      const descriptor = data.workflowRuntime.blockDescriptor;
      const entry = descriptor?.action ?? descriptor?.trigger;
      if (!descriptor || !entry) return null;
      const isTrigger = !descriptor.action && Boolean(descriptor.trigger);
      return {
        title: `${descriptor.displayName} · ${entry.displayName}`,
        requireAuth: entry.requireAuth,
        auth: !descriptor.auth
          ? ("none" as const)
          : entry.requireAuth
            ? ("required" as const)
            : ("optional" as const),
        props: isTrigger ? [...entry.props, POLL_INTERVAL_PROP] : entry.props,
      };
    });
    formCache.set(blockType, cached);
    cached.catch(() => formCache.delete(blockType));
  }
  return cached;
}

export interface PieceSummary {
  name: string;
  displayName: string;
  description: string;
  logoUrl: string;
  version: string;
  actionCount: number;
  triggerCount: number;
  // Activepieces category ids, e.g. ARTIFICIAL_INTELLIGENCE, SALES_AND_CRM.
  categories: string[];
  // PieceAuth descriptor, verbatim from the piece; null when authless.
  auth?: unknown;
}

export interface PieceActionEntry {
  name: string;
  displayName: string;
  description: string;
  blockType: string;
}

let catalogCache: Promise<PieceSummary[]> | undefined;

export function fetchPieceCatalog(): Promise<PieceSummary[]> {
  catalogCache ??= gql<{ workflowRuntime: { pieceCatalog: PieceSummary[] } }>(
    `query Catalog { workflowRuntime { pieceCatalog } }`,
    {},
  ).then((data) => data.workflowRuntime.pieceCatalog);
  catalogCache.catch(() => (catalogCache = undefined));
  return catalogCache;
}

export async function fetchPieceActions(
  packageName: string,
): Promise<PieceActionEntry[]> {
  const data = await gql<{
    workflowRuntime: { pieceActions: { actions: PieceActionEntry[] } };
  }>(
    `query Actions($packageName: String!) {
      workflowRuntime { pieceActions(packageName: $packageName) }
    }`,
    { packageName },
  );
  return data.workflowRuntime.pieceActions.actions;
}

export interface PieceTriggerEntry {
  name: string;
  displayName: string;
  description: string;
  strategy: string;
  blockType: string;
}

export async function fetchPieceTriggers(
  packageName: string,
): Promise<PieceTriggerEntry[]> {
  const data = await gql<{
    workflowRuntime: { pieceTriggers: { triggers: PieceTriggerEntry[] } };
  }>(
    `query Triggers($packageName: String!) {
      workflowRuntime { pieceTriggers(packageName: $packageName) }
    }`,
    { packageName },
  );
  return data.workflowRuntime.pieceTriggers.triggers;
}

export interface BlockSearchHit {
  blockType: string;
  pieceName: string;
  pieceDisplayName: string;
  logoUrl: string;
  displayName: string;
  description: string;
  kind: "action" | "trigger";
  strategy: string | null;
}

export interface BlockSearchResult {
  status: "ready" | "indexing" | "error";
  hits: BlockSearchHit[];
  indexedPieces: number;
  error: string | null;
}

// Catalog-wide action/trigger search; "indexing" on the very first calls.
export async function searchBlocks(
  query: string,
  limit = 30,
): Promise<BlockSearchResult> {
  const data = await gql<{
    workflowRuntime: { searchBlocks: BlockSearchResult };
  }>(
    `query SearchBlocks($query: String!, $limit: Int) {
      workflowRuntime { searchBlocks(query: $query, limit: $limit) {
        status indexedPieces error
        hits { blockType pieceName pieceDisplayName logoUrl displayName description kind strategy }
      } }
    }`,
    { query, limit },
  );
  return data.workflowRuntime.searchBlocks;
}

export interface OutputTreeNode {
  name: string;
  type: string;
  description?: string;
  children?: OutputTreeNode[];
}

export interface OutputTree {
  source: "schema" | "sample" | "static" | "none";
  nodes: OutputTreeNode[];
}

const outputTreeCache = new Map<string, Promise<OutputTree>>();

export function fetchBlockOutputTree(
  blockType: string,
  config: unknown,
): Promise<OutputTree> {
  const key = `${blockType}:${JSON.stringify(config ?? {})}`;
  let cached = outputTreeCache.get(key);
  if (!cached) {
    cached = gql<{ workflowRuntime: { blockOutputTree: OutputTree } }>(
      `query OutputTree($blockType: String!, $config: Unknown) {
        workflowRuntime { blockOutputTree(blockType: $blockType, config: $config) }
      }`,
      { blockType, config: config ?? {} },
    ).then((data) => data.workflowRuntime.blockOutputTree);
    outputTreeCache.set(key, cached);
    cached.catch(() => outputTreeCache.delete(key));
  }
  return cached;
}

export interface ConnectionSummary {
  id: string;
  name: string;
  connectorId: string;
  authType: string;
  status: string;
  accountLabel: string | null;
}

// Short-lived: connections change as the user edits them in Connect.
let connectionsCache:
  | { at: number; promise: Promise<ConnectionSummary[]> }
  | undefined;
const CONNECTIONS_TTL_MS = 10_000;

export function fetchConnections(): Promise<ConnectionSummary[]> {
  if (
    !connectionsCache ||
    Date.now() - connectionsCache.at > CONNECTIONS_TTL_MS
  ) {
    const promise = gql<{
      workflowRuntime: { connections: ConnectionSummary[] };
    }>(
      `query Connections { workflowRuntime { connections { id name connectorId authType status accountLabel } } }`,
      {},
    ).then((data) => data.workflowRuntime.connections);
    connectionsCache = { at: Date.now(), promise };
    promise.catch(() => (connectionsCache = undefined));
  }
  return connectionsCache.promise;
}

// The picker creates connections itself; the cache must not hide them.
export function invalidateConnections(): void {
  connectionsCache = undefined;
}

export interface ConnectionCheckResult {
  ok: boolean;
  detail: string;
  accountLabel: string | null;
}

// Runs the piece's own connection check against a document's stored
// credentials. No secret values cross this boundary: the subgraph
// resolves refs server-side.
export function checkConnection(
  connectionId: string,
): Promise<ConnectionCheckResult> {
  return gql<{
    workflowRuntime: { checkConnection: ConnectionCheckResult };
  }>(
    `mutation CheckConnection($connectionId: String!) {
      workflowRuntime {
        checkConnection(connectionId: $connectionId) {
          ok
          detail
          accountLabel
        }
      }
    }`,
    { connectionId },
  ).then((data) => data.workflowRuntime.checkConnection);
}

export interface SecretStat {
  ref: string;
  label: string | null;
  version: number;
  status: "ACTIVE" | "DELETED";
  createdAt: string;
  updatedAt: string;
}

const SECRET_FIELDS = "ref label version status createdAt updatedAt";

// Mints a managed secret; only the returned ref ever enters a document.
export async function createSecret(
  value: string,
  label?: string,
): Promise<SecretStat> {
  const data = await gql<{ workflowRuntime: { createSecret: SecretStat } }>(
    `mutation CreateSecret($value: String!, $label: String) {
      workflowRuntime { createSecret(value: $value, label: $label) { ${SECRET_FIELDS} } }
    }`,
    { value, label: label ?? null },
  );
  return data.workflowRuntime.createSecret;
}

// Same ref, version+1; referencing documents stay untouched.
export async function rotateSecret(
  ref: string,
  value: string,
): Promise<SecretStat> {
  const data = await gql<{ workflowRuntime: { rotateSecret: SecretStat } }>(
    `mutation RotateSecret($ref: String!, $value: String!) {
      workflowRuntime { rotateSecret(ref: $ref, value: $value) { ${SECRET_FIELDS} } }
    }`,
    { ref, value },
  );
  return data.workflowRuntime.rotateSecret;
}

// Metadata only; null for unknown or legacy refs.
export async function fetchSecretStat(ref: string): Promise<SecretStat | null> {
  const data = await gql<{ workflowRuntime: { secret: SecretStat | null } }>(
    `query Secret($ref: String!) {
      workflowRuntime { secret(ref: $ref) { ${SECRET_FIELDS} } }
    }`,
    { ref },
  );
  return data.workflowRuntime.secret;
}

export async function testTrigger(workflowId: string): Promise<unknown> {
  const data = await gql<{ workflowRuntime: { testTrigger: unknown } }>(
    `mutation TestTrigger($workflowId: String!) {
      workflowRuntime { testTrigger(workflowId: $workflowId) }
    }`,
    { workflowId },
  );
  return data.workflowRuntime.testTrigger;
}

export interface RunStepRecord {
  stepId: string;
  stepKey: string;
  blockType: string;
  status: string;
  input: unknown;
  output: unknown;
  port: string | null;
  error: string | null;
}

export interface RunRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  triggerKind: string;
  triggerPayload: unknown;
  status: string;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
  rerunOf: string | null;
  steps: RunStepRecord[];
}

const RUN_FIELDS = `id workflowId workflowName workflowVersion triggerKind
  triggerPayload status error startedAt endedAt rerunOf
  steps { stepId stepKey blockType status input output port error }`;

export interface RunsScope {
  workflowId?: string;
  // Scopes runs to the workflows the drive holds; ignored alongside workflowId.
  driveId?: string;
  limit?: number;
}

export async function fetchRuns(scope: RunsScope = {}): Promise<RunRecord[]> {
  const data = await gql<{ workflowRuntime: { runs: RunRecord[] } }>(
    `query Runs($workflowId: String, $driveId: String, $limit: Int) {
      workflowRuntime { runs(workflowId: $workflowId, driveId: $driveId, limit: $limit) { ${RUN_FIELDS} } }
    }`,
    {
      workflowId: scope.workflowId ?? null,
      driveId: scope.driveId ?? null,
      limit: scope.limit ?? 30,
    },
  );
  return data.workflowRuntime.runs;
}

export interface FireResult {
  runId: string | null;
  status: string;
  error: string | null;
}

export async function fireWorkflow(
  workflowId: string,
  payload?: unknown,
): Promise<FireResult> {
  const data = await gql<{ workflowRuntime: { fire: FireResult } }>(
    `mutation Fire($workflowId: String!, $payload: Unknown) {
      workflowRuntime { fire(workflowId: $workflowId, payload: $payload) { runId status error } }
    }`,
    { workflowId, payload: payload ?? {} },
  );
  return data.workflowRuntime.fire;
}

// Resume a FAILED run: succeeded steps replay, execution restarts at the
// failure. Returns the new run.
export async function rerunRun(runId: string): Promise<FireResult> {
  const data = await gql<{ workflowRuntime: { rerun: FireResult } }>(
    `mutation Rerun($runId: String!) {
      workflowRuntime { rerun(runId: $runId) { runId status error } }
    }`,
    { runId },
  );
  return data.workflowRuntime.rerun;
}

interface BlockOptionsResult {
  workflowRuntime: { blockOptions: unknown };
}

export async function loadBlockOptions(
  blockType: string,
  propName: string,
  input: Record<string, unknown>,
  connectionId?: string,
): Promise<unknown> {
  const data = await gql<BlockOptionsResult>(
    `query Options($blockType: String!, $propName: String!, $input: Unknown, $connectionId: String) {
      workflowRuntime { blockOptions(blockType: $blockType, propName: $propName, input: $input, connectionId: $connectionId) }
    }`,
    { blockType, propName, input, connectionId: connectionId ?? null },
  );
  return data.workflowRuntime.blockOptions;
}
