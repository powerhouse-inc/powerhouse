// Design-time channel to the workflow-runtime subgraph: piece descriptors
// and dynamic option resolution. Not document-model coupled.
import { CORE_FORMS, type BlockForm, type BlockFormProp } from "./ui/forms.js";

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
      return {
        title: `${descriptor.displayName} · ${entry.displayName}`,
        requireAuth: entry.requireAuth,
        props: entry.props,
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
  steps: RunStepRecord[];
}

const RUN_FIELDS = `id workflowId workflowName workflowVersion triggerKind
  triggerPayload status error startedAt endedAt
  steps { stepId stepKey blockType status input output port error }`;

export async function fetchRuns(
  workflowId?: string,
  limit = 30,
): Promise<RunRecord[]> {
  const data = await gql<{ workflowRuntime: { runs: RunRecord[] } }>(
    `query Runs($workflowId: String, $limit: Int) {
      workflowRuntime { runs(workflowId: $workflowId, limit: $limit) { ${RUN_FIELDS} } }
    }`,
    { workflowId: workflowId ?? null, limit },
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
