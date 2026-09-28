// Design-time channel to the workflow-runtime subgraph: piece descriptors,
// option resolution, runs and secrets. Not document-model coupled.
import { ambientRenownTokenProvider } from "@powerhousedao/reactor-browser/graphql-client";
import {
  POLL_INTERVAL_PROP,
  type BlockForm,
  type BlockFormProp,
  type ErrorHandlingDefaults,
  type PropertyGroup,
} from "./ui/forms.js";
import {
  isCoreBlock,
  isReactorPieceBlock,
  type BlockRef,
} from "./ui/blocks.js";
import { checkTriggerStrategy } from "@powerhousedao/pieces-framework/workflow";

export const DEFAULT_RUNTIME_URL =
  "http://localhost:4001/graphql/workflow-runtime";

export interface Transport {
  url: string;
  gql: <T>(query: string, variables: Record<string, unknown>) => Promise<T>;
}

export interface RuntimeClientOptions {
  fetch?: typeof fetch;
  // Bearer token source; defaults to the ambient Renown token.
  token?: () => Promise<string | null | undefined>;
}

function createTransport(
  url: string,
  options: RuntimeClientOptions,
): Transport {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const tokenOf = options.token ?? ambientRenownTokenProvider;
  return {
    url,
    gql: (query, variables) => gql(url, doFetch, tokenOf, query, variables),
  };
}

// A runtime error with its GraphQL extension code, when the server sent one.
export class RuntimeRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RuntimeRequestError";
  }
}

// The workflow document hasn't reached the runtime yet; the call can be retried.
export function isSyncingError(error: unknown): boolean {
  return (
    error instanceof RuntimeRequestError && error.code === "WORKFLOW_SYNCING"
  );
}

async function gql<T>(
  url: string,
  doFetch: typeof fetch,
  tokenOf: () => Promise<string | null | undefined>,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  // Mirrors the reactor-browser switchboard AI tool's auth: attach the
  // Renown bearer token when one is available, else go out anonymously.
  const token = await tokenOf();
  const response = await doFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string; extensions?: { code?: unknown } }[];
  };
  const first = body.errors?.[0];
  if (first) {
    const code = first.extensions?.code;
    throw new RuntimeRequestError(
      first.message,
      typeof code === "string" ? code : undefined,
    );
  }
  if (!body.data) throw new Error("Empty GraphQL response");
  return body.data;
}

interface BlockEntryDescriptor {
  displayName: string;
  description?: string;
  requireAuth: boolean;
  props: BlockFormProp[];
  ports?: string[];
  // Triggers only; read through checkTriggerStrategy.
  strategy?: string;
  display?: string;
  propertyGroups?: PropertyGroup[];
  classification?: string;
  errorHandlingOptions?: ErrorHandlingDefaults;
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

// The GraphQL BlockInput for a block.
export function blockInput(block: BlockRef) {
  return {
    pieceName: block.pieceName,
    pieceVersion: block.pieceVersion,
    name: block.name,
    kind: block.kind,
  };
}

export function getBlockForm(
  t: Transport,
  block: BlockRef,
): Promise<BlockForm | null> {
  return t
    .gql<BlockDescriptorResult>(
      `query Descriptor($block: BlockInput!) {
        workflowRuntime { blockDescriptor(block: $block) }
      }`,
      { block: blockInput(block) },
    )
    .then((data) => {
      const descriptor = data.workflowRuntime.blockDescriptor;
      const entry = descriptor?.action ?? descriptor?.trigger;
      if (!descriptor || !entry) return null;
      const isTrigger = !descriptor.action && Boolean(descriptor.trigger);
      const strategy = isTrigger
        ? checkTriggerStrategy(entry.strategy)
        : undefined;
      // The runtime refuses it too, so no form is drawn for it.
      if (strategy && "issue" in strategy) throw new Error(strategy.issue);
      const delivery = strategy?.delivery;
      // A poll cadence only means something for a piece trigger the reactor
      // polls; the reactor piece's are fed by the host, core ones fire themselves.
      const polled =
        delivery === "poll" &&
        !isCoreBlock(block) &&
        !isReactorPieceBlock(block);
      const props = entry.props;
      return {
        // A core block belongs to no piece worth naming.
        title: isCoreBlock(block)
          ? entry.displayName
          : `${descriptor.displayName} · ${entry.displayName}`,
        requireAuth: entry.requireAuth,
        auth: !descriptor.auth
          ? ("none" as const)
          : entry.requireAuth
            ? ("required" as const)
            : ("optional" as const),
        props: polled ? [...props, POLL_INTERVAL_PROP] : props,
        ...(entry.ports ? { ports: entry.ports } : {}),
        ...(delivery ? { triggerDelivery: delivery } : {}),
        ...(entry.display ? { display: entry.display } : {}),
        ...(entry.description ? { description: entry.description } : {}),
        ...(entry.propertyGroups
          ? { propertyGroups: entry.propertyGroups }
          : {}),
        ...(entry.classification
          ? { classification: entry.classification }
          : {}),
        ...(entry.errorHandlingOptions
          ? { errorHandling: entry.errorHandlingOptions }
          : {}),
      };
    });
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
  // Why none of the piece's blocks can run on this reactor.
  unsupported?: string | null;
  deprecated?: boolean;
  // A package piece shadowing a published one: the version published.
  publishedVersion?: string;
}

// One action of a piece, at the version the listing answered with.
export interface PieceActionEntry {
  pieceName: string;
  pieceVersion: string;
  name: string;
  displayName: string;
  description: string;
  unsupported?: string | null;
}

interface PieceListing<T> {
  name: string;
  version: string;
  entries: T[];
}

function atVersion<T>(listing: PieceListing<T>) {
  return listing.entries.map((entry) => ({
    ...entry,
    pieceName: listing.name,
    pieceVersion: listing.version,
  }));
}

export function fetchPieceCatalog(t: Transport): Promise<PieceSummary[]> {
  return t
    .gql<{
      workflowRuntime: { pieceCatalog: PieceSummary[] };
    }>(`query Catalog { workflowRuntime { pieceCatalog } }`, {})
    .then((data) => data.workflowRuntime.pieceCatalog);
}

export async function fetchPieceActions(
  t: Transport,
  packageName: string,
): Promise<PieceActionEntry[]> {
  const data = await t.gql<{
    workflowRuntime: {
      pieceActions: {
        name: string;
        version: string;
        actions: Omit<PieceActionEntry, "pieceName" | "pieceVersion">[];
      };
    };
  }>(
    `query Actions($packageName: String!) {
      workflowRuntime { pieceActions(packageName: $packageName) }
    }`,
    { packageName },
  );
  const listing = data.workflowRuntime.pieceActions;
  return atVersion({ ...listing, entries: listing.actions });
}

export interface PieceTriggerEntry {
  pieceName: string;
  pieceVersion: string;
  name: string;
  displayName: string;
  description: string;
  strategy: string;
  unsupported?: string | null;
}

export async function fetchPieceTriggers(
  t: Transport,
  packageName: string,
): Promise<PieceTriggerEntry[]> {
  const data = await t.gql<{
    workflowRuntime: {
      pieceTriggers: {
        name: string;
        version: string;
        triggers: Omit<PieceTriggerEntry, "pieceName" | "pieceVersion">[];
      };
    };
  }>(
    `query Triggers($packageName: String!) {
      workflowRuntime { pieceTriggers(packageName: $packageName) }
    }`,
    { packageName },
  );
  const listing = data.workflowRuntime.pieceTriggers;
  return atVersion({ ...listing, entries: listing.triggers });
}

export interface BlockSearchHit {
  pieceName: string;
  pieceVersion: string;
  // The action or trigger name.
  name: string;
  pieceDisplayName: string;
  logoUrl: string;
  displayName: string;
  description: string;
  kind: "action" | "trigger";
  strategy: string | null;
  unsupported: string | null;
}

export interface BlockSearchResult {
  status: "ready" | "indexing" | "error";
  hits: BlockSearchHit[];
  indexedPieces: number;
  error: string | null;
}

// Catalog-wide action/trigger search; "indexing" on the very first calls.
export async function searchBlocks(
  t: Transport,
  query: string,
  limit = 30,
): Promise<BlockSearchResult> {
  const data = await t.gql<{
    workflowRuntime: { searchBlocks: BlockSearchResult };
  }>(
    `query SearchBlocks($query: String!, $limit: Int) {
      workflowRuntime { searchBlocks(query: $query, limit: $limit) {
        status indexedPieces error
        hits { pieceName pieceVersion name pieceDisplayName logoUrl displayName description kind strategy unsupported }
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
  source: "schema" | "sample" | "static" | "none" | "test";
  nodes: OutputTreeNode[];
  // source "test" only: the last test's output and when it ran.
  sample?: unknown;
  testedAt?: string;
  runId?: string;
}

export function fetchBlockOutputTree(
  t: Transport,
  block: BlockRef,
  config: unknown,
): Promise<OutputTree> {
  return t
    .gql<{ workflowRuntime: { blockOutputTree: OutputTree } }>(
      `query OutputTree($block: BlockInput!, $config: Unknown) {
        workflowRuntime { blockOutputTree(block: $block, config: $config) }
      }`,
      { block: blockInput(block), config: config ?? {} },
    )
    .then((data) => data.workflowRuntime.blockOutputTree);
}

// A draft step's or trigger's tree: its last test output, else its shape.
export function fetchStepOutputTree(
  t: Transport,
  workflowId: string,
  stepId: string,
): Promise<OutputTree> {
  return t
    .gql<{ workflowRuntime: { stepOutputTree: OutputTree } }>(
      `query StepOutputTree($workflowId: String!, $stepId: String!) {
        workflowRuntime { stepOutputTree(workflowId: $workflowId, stepId: $stepId) }
      }`,
      { workflowId, stepId },
    )
    .then((data) => data.workflowRuntime.stepOutputTree);
}

export interface ConnectionSummary {
  id: string;
  name: string;
  connectorId: string;
  authType: string;
  status: string;
  accountLabel: string | null;
}

// Never persisted: the server scopes this list to the caller's read access.
export function fetchConnections(t: Transport): Promise<ConnectionSummary[]> {
  return t
    .gql<{
      workflowRuntime: { connections: ConnectionSummary[] };
    }>(
      `query Connections { workflowRuntime { connections { id name connectorId authType status accountLabel } } }`,
      {},
    )
    .then((data) => data.workflowRuntime.connections);
}

export interface ConnectionCheckResult {
  ok: boolean;
  detail: string;
  accountLabel: string | null;
}

// Runs the piece's own connection check against a document's stored credentials.
// No secrets cross this boundary: the subgraph resolves refs server-side.
export function checkConnection(
  t: Transport,
  connectionId: string,
): Promise<ConnectionCheckResult> {
  return t
    .gql<{
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
    )
    .then((data) => data.workflowRuntime.checkConnection);
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
  t: Transport,
  value: string,
  label?: string,
): Promise<SecretStat> {
  const data = await t.gql<{ workflowRuntime: { createSecret: SecretStat } }>(
    `mutation CreateSecret($value: String!, $label: String) {
      workflowRuntime { createSecret(value: $value, label: $label) { ${SECRET_FIELDS} } }
    }`,
    { value, label: label ?? null },
  );
  return data.workflowRuntime.createSecret;
}

// Same ref, version+1; referencing documents stay untouched.
export async function rotateSecret(
  t: Transport,
  ref: string,
  value: string,
): Promise<SecretStat> {
  const data = await t.gql<{ workflowRuntime: { rotateSecret: SecretStat } }>(
    `mutation RotateSecret($ref: String!, $value: String!) {
      workflowRuntime { rotateSecret(ref: $ref, value: $value) { ${SECRET_FIELDS} } }
    }`,
    { ref, value },
  );
  return data.workflowRuntime.rotateSecret;
}

// Metadata only; null for unknown or legacy refs.
export async function fetchSecretStat(
  t: Transport,
  ref: string,
): Promise<SecretStat | null> {
  const data = await t.gql<{ workflowRuntime: { secret: SecretStat | null } }>(
    `query Secret($ref: String!) {
      workflowRuntime { secret(ref: $ref) { ${SECRET_FIELDS} } }
    }`,
    { ref },
  );
  return data.workflowRuntime.secret;
}

export interface WebhookEndpointRecord {
  workflowId: string;
  url: string;
  // False when `url` is a bare path because the reactor has no public origin.
  absoluteUrl: boolean;
  armed: boolean;
  createdAt: string;
}

// Never cached: the runtime mints the endpoint on the first call and `armed`
// tracks the workflow's status.
export async function fetchWebhookEndpoint(
  t: Transport,
  workflowId: string,
  driveId?: string,
): Promise<WebhookEndpointRecord | null> {
  const data = await t.gql<{
    workflowRuntime: { webhookEndpoint: WebhookEndpointRecord | null };
  }>(
    `query WebhookEndpoint($workflowId: String!, $driveId: String) {
      workflowRuntime {
        webhookEndpoint(workflowId: $workflowId, driveId: $driveId) {
          workflowId url absoluteUrl armed createdAt
        }
      }
    }`,
    { workflowId, driveId: driveId ?? null },
  );
  return data.workflowRuntime.webhookEndpoint;
}

export async function testTrigger(
  t: Transport,
  workflowId: string,
  driveId?: string,
): Promise<unknown> {
  const data = await t.gql<{ workflowRuntime: { testTrigger: unknown } }>(
    `mutation TestTrigger($workflowId: String!, $driveId: String) {
      workflowRuntime { testTrigger(workflowId: $workflowId, driveId: $driveId) }
    }`,
    { workflowId, driveId: driveId ?? null },
  );
  return data.workflowRuntime.testTrigger;
}

export interface CoreTriggerTestOptions {
  // The manual trigger: the sample payload.
  payload?: unknown;
  // The webhook trigger: how long to wait for a delivery (default and cap 300).
  timeoutSeconds?: number;
  // Lets the runtime wait for a workflow that hasn't synced yet.
  driveId?: string;
}

// Tests the draft trigger, core ones included: manual saves `payload`, schedule
// samples a fire now, webhook resolves with the next delivery to its endpoint.
export async function testCoreTrigger(
  t: Transport,
  workflowId: string,
  options: CoreTriggerTestOptions = {},
): Promise<unknown> {
  const data = await t.gql<{ workflowRuntime: { testTrigger: unknown } }>(
    `mutation TestCoreTrigger($workflowId: String!, $payload: Unknown, $timeoutSeconds: Int, $driveId: String) {
      workflowRuntime {
        testTrigger(workflowId: $workflowId, payload: $payload, timeoutSeconds: $timeoutSeconds, driveId: $driveId)
      }
    }`,
    {
      workflowId,
      payload: options.payload ?? null,
      timeoutSeconds: options.timeoutSeconds ?? null,
      driveId: options.driveId ?? null,
    },
  );
  return data.workflowRuntime.testTrigger;
}

// Stops a waiting webhook test; false when none was waiting.
export async function cancelTriggerTest(
  t: Transport,
  workflowId: string,
): Promise<boolean> {
  const data = await t.gql<{ workflowRuntime: { cancelTriggerTest: boolean } }>(
    `mutation CancelTriggerTest($workflowId: String!) {
      workflowRuntime { cancelTriggerTest(workflowId: $workflowId) }
    }`,
    { workflowId },
  );
  return data.workflowRuntime.cancelTriggerTest;
}

export interface StepTestResult {
  // Null when the test never started, e.g. `Test "fetch" first`.
  runId: string | null;
  status: "SUCCEEDED" | "FAILED";
  output: unknown;
  error: string | null;
  durationMs: number;
}

// Runs one draft step against the latest test outputs of the blocks it reads.
export async function testStep(
  t: Transport,
  workflowId: string,
  stepId: string,
  driveId?: string,
): Promise<StepTestResult> {
  const data = await t.gql<{ workflowRuntime: { testStep: StepTestResult } }>(
    `mutation TestStep($workflowId: String!, $stepId: String!, $driveId: String) {
      workflowRuntime {
        testStep(workflowId: $workflowId, stepId: $stepId, driveId: $driveId) {
          runId status output error durationMs
        }
      }
    }`,
    { workflowId, stepId, driveId: driveId ?? null },
  );
  return data.workflowRuntime.testStep;
}

export type BlockMatch =
  | "exact"
  | "compatible"
  | "fallback"
  | "installed"
  | "missing";

export interface BlockResolution {
  // The trigger's or step's id.
  stepId: string;
  pieceName: string;
  // The version the block pins.
  pieceVersion: string;
  name: string;
  kind: "action" | "trigger";
  // Null when nothing resolves.
  resolvedVersion: string | null;
  source: "local" | "registry" | "activepieces" | "npm" | null;
  match: BlockMatch;
  // Why the version that runs differs from the pin, or why nothing resolves.
  note: string | null;
  // Newest version any source offers.
  latestVersion: string | null;
}

// Every block of the draft, trigger first, as the runtime would run it.
export async function blockResolutions(
  t: Transport,
  workflowId: string,
): Promise<BlockResolution[]> {
  const data = await t.gql<{
    workflowRuntime: { blockResolutions: BlockResolution[] };
  }>(
    `query BlockResolutions($workflowId: String!) {
      workflowRuntime {
        blockResolutions(workflowId: $workflowId) {
          stepId pieceName pieceVersion name kind resolvedVersion source match note latestVersion
        }
      }
    }`,
    { workflowId },
  );
  return data.workflowRuntime.blockResolutions;
}

export interface RunStepRecord {
  stepId: string;
  stepKey: string;
  pieceName: string;
  // The action the step ran, or the trigger a trigger test sampled.
  blockName: string;
  status: string;
  input: unknown;
  output: unknown;
  port: string | null;
  error: string | null;
  // Null for skipped and replayed steps, and for runs journaled before timings.
  startedAt: string | null;
  endedAt: string | null;
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
  // Why a finished run is not a plain success, e.g. an edge nothing takes.
  warningNotes: string[];
  steps: RunStepRecord[];
}

const RUN_FIELDS = `id workflowId workflowName workflowVersion triggerKind
  triggerPayload status error startedAt endedAt rerunOf warningNotes
  steps { stepId stepKey pieceName blockName status input output port error startedAt endedAt }`;

export interface RunsScope {
  workflowId?: string;
  // Scopes runs to the workflows the drive holds; ignored alongside workflowId.
  driveId?: string;
  limit?: number;
}

export async function fetchRuns(
  t: Transport,
  scope: RunsScope = {},
): Promise<RunRecord[]> {
  const data = await t.gql<{ workflowRuntime: { runs: RunRecord[] } }>(
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

export async function fetchRun(
  t: Transport,
  runId: string,
): Promise<RunRecord | null> {
  const data = await t.gql<{ workflowRuntime: { run: RunRecord | null } }>(
    `query Run($id: String!) { workflowRuntime { run(id: $id) { ${RUN_FIELDS} } } }`,
    { id: runId },
  );
  return data.workflowRuntime.run;
}

export interface FireResult {
  runId: string | null;
  status: string;
  error: string | null;
}

export async function fireWorkflow(
  t: Transport,
  workflowId: string,
  payload?: unknown,
): Promise<FireResult> {
  const data = await t.gql<{ workflowRuntime: { fire: FireResult } }>(
    `mutation Fire($workflowId: String!, $payload: Unknown) {
      workflowRuntime { fire(workflowId: $workflowId, payload: $payload) { runId status error } }
    }`,
    { workflowId, payload: payload ?? {} },
  );
  return data.workflowRuntime.fire;
}

// Resume a FAILED run: succeeded steps replay, execution restarts at the
// failure. Returns the new run.
export async function rerunRun(
  t: Transport,
  runId: string,
): Promise<FireResult> {
  const data = await t.gql<{ workflowRuntime: { rerun: FireResult } }>(
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
  t: Transport,
  block: BlockRef,
  propName: string,
  input: Record<string, unknown>,
  connectionId?: string,
  searchValue?: string,
): Promise<unknown> {
  const data = await t.gql<BlockOptionsResult>(
    `query Options($block: BlockInput!, $propName: String!, $input: Unknown, $connectionId: String, $searchValue: String) {
      workflowRuntime { blockOptions(block: $block, propName: $propName, input: $input, connectionId: $connectionId, searchValue: $searchValue) }
    }`,
    {
      block: blockInput(block),
      propName,
      input,
      connectionId: connectionId ?? null,
      searchValue: searchValue ?? null,
    },
  );
  return data.workflowRuntime.blockOptions;
}

const operations = {
  getBlockForm,
  fetchPieceCatalog,
  fetchPieceActions,
  fetchPieceTriggers,
  searchBlocks,
  fetchBlockOutputTree,
  fetchStepOutputTree,
  fetchConnections,
  checkConnection,
  createSecret,
  rotateSecret,
  fetchSecretStat,
  fetchWebhookEndpoint,
  testTrigger,
  testCoreTrigger,
  cancelTriggerTest,
  testStep,
  blockResolutions,
  fetchRuns,
  fetchRun,
  fireWorkflow,
  rerunRun,
  loadBlockOptions,
};

type Operations = typeof operations;
type Bound<F> = F extends (t: Transport, ...args: infer A) => infer R
  ? (...args: A) => R
  : never;
type BoundOperations = { [K in keyof Operations]: Bound<Operations[K]> };

// Every workflow-runtime call, bound to one subgraph URL. Holds no cache.
export type RuntimeClient = Transport & BoundOperations;

export function createRuntimeClient(
  url: string,
  options: RuntimeClientOptions = {},
): RuntimeClient {
  const transport = createTransport(url, options);
  const bound = Object.fromEntries(
    Object.entries(operations).map(([name, operation]) => [
      name,
      (...args: unknown[]) =>
        (operation as (t: Transport, ...rest: unknown[]) => unknown)(
          transport,
          ...args,
        ),
    ]),
  ) as BoundOperations;
  return { ...transport, ...bound };
}
