// The switchboard surface this suite drives: the workflow document model's own
// subgraph to author a workflow, and the runtime subgraph to run and read it.

export interface GraphQLErrorShape {
  message: string;
}

export class GraphQLFailure extends Error {
  constructor(
    readonly path: string,
    readonly errors: GraphQLErrorShape[],
  ) {
    super(
      `GraphQL error at ${path}:\n  ${errors.map((e) => e.message).join("\n  ")}`,
    );
    this.name = "GraphQLFailure";
  }
}

export class SwitchboardClient {
  constructor(private readonly baseUrl: string) {}

  async request<T>(
    path: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    let body: { data?: T; errors?: GraphQLErrorShape[] };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      throw new Error(
        `Non-JSON response from ${path} (status ${res.status}): ${text.slice(0, 400)}`,
      );
    }
    if (body.errors?.length) throw new GraphQLFailure(path, body.errors);
    if (!body.data) throw new Error(`No data in response from ${path}`);
    return body.data;
  }
}

export interface PieceCatalogEntry {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  actionCount?: number;
  triggerCount?: number;
}

export interface BlockSearchHit {
  blockType: string;
  pieceName: string;
  displayName: string;
  kind: string;
}

export interface BlockSearchResult {
  status: string;
  hits: BlockSearchHit[];
  indexedPieces: number;
  error: string | null;
}

export interface StepRunRecord {
  stepKey: string;
  blockType: string;
  status: string;
  output: unknown;
  error: string | null;
}

export interface RunRecord {
  id: string;
  status: string;
  error: string | null;
  steps: StepRunRecord[];
}

const RUNTIME_PATH = "/graphql/workflow-runtime";
const WORKFLOW_PATH = "/graphql/workflow";

export async function runtimeHealth(
  client: SwitchboardClient,
): Promise<string> {
  const data = await client.request<{ workflowRuntime: { health: string } }>(
    RUNTIME_PATH,
    `query { workflowRuntime { health } }`,
  );
  return data.workflowRuntime.health;
}

export async function pieceCatalog(
  client: SwitchboardClient,
): Promise<PieceCatalogEntry[]> {
  const data = await client.request<{
    workflowRuntime: { pieceCatalog: PieceCatalogEntry[] | null };
  }>(RUNTIME_PATH, `query { workflowRuntime { pieceCatalog } }`);
  return data.workflowRuntime.pieceCatalog ?? [];
}

export async function searchBlocks(
  client: SwitchboardClient,
  query: string,
): Promise<BlockSearchResult> {
  const data = await client.request<{
    workflowRuntime: { searchBlocks: BlockSearchResult };
  }>(
    RUNTIME_PATH,
    `query Search($query: String!) {
      workflowRuntime {
        searchBlocks(query: $query) {
          status
          indexedPieces
          error
          hits { blockType pieceName displayName kind }
        }
      }
    }`,
    { query },
  );
  return data.workflowRuntime.searchBlocks;
}

// The index builds lazily on first use, so a "indexing" answer is polled out
// rather than treated as a miss.
export async function searchBlocksWhenReady(
  client: SwitchboardClient,
  query: string,
  timeoutMs = 60_000,
): Promise<BlockSearchResult> {
  const deadline = Date.now() + timeoutMs;
  let last: BlockSearchResult | undefined;
  while (Date.now() < deadline) {
    last = await searchBlocks(client, query);
    if (last.status !== "indexing") return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `searchBlocks("${query}") was still indexing after ${timeoutMs}ms (last: ${JSON.stringify(last)})`,
  );
}

export interface WorkflowStepInput {
  id: string;
  key: string;
  name: string;
  blockType: string;
  config: Record<string, unknown>;
}

export interface WorkflowInput {
  name: string;
  trigger: { id: string; blockType: string; config: Record<string, unknown> };
  steps: WorkflowStepInput[];
  edges: { id: string; from: string; to: string; port: string }[];
}

// Authored the way a client authors one: create the document, then one
// mutation per structural edit, then enable it.
export async function createWorkflow(
  client: SwitchboardClient,
  input: WorkflowInput,
): Promise<string> {
  const created = await client.request<{
    Workflow: { createDocument: { id: string } };
  }>(
    WORKFLOW_PATH,
    `mutation Create($name: String!) {
      Workflow { createDocument(name: $name) { id } }
    }`,
    { name: input.name },
  );
  const id = created.Workflow.createDocument.id;

  await client.request(
    WORKFLOW_PATH,
    `mutation Name($docId: PHID!, $input: Workflow_SetWorkflowNameInput!) {
      Workflow { setWorkflowName(docId: $docId, input: $input) { id } }
    }`,
    { docId: id, input: { name: input.name } },
  );

  await client.request(
    WORKFLOW_PATH,
    `mutation Trigger($docId: PHID!, $input: Workflow_SetTriggerInput!) {
      Workflow { setTrigger(docId: $docId, input: $input) { id } }
    }`,
    { docId: id, input: input.trigger },
  );

  for (const step of input.steps) {
    await client.request(
      WORKFLOW_PATH,
      `mutation Step($docId: PHID!, $input: Workflow_AddStepInput!) {
        Workflow { addStep(docId: $docId, input: $input) { id } }
      }`,
      { docId: id, input: step },
    );
  }

  for (const edge of input.edges) {
    await client.request(
      WORKFLOW_PATH,
      `mutation Edge($docId: PHID!, $input: Workflow_AddEdgeInput!) {
        Workflow { addEdge(docId: $docId, input: $input) { id } }
      }`,
      { docId: id, input: edge },
    );
  }

  await client.request(
    WORKFLOW_PATH,
    `mutation Status($docId: PHID!, $input: Workflow_SetWorkflowStatusInput!) {
      Workflow { setWorkflowStatus(docId: $docId, input: $input) { id } }
    }`,
    { docId: id, input: { status: "ENABLED" } },
  );

  return id;
}

export async function fireWorkflow(
  client: SwitchboardClient,
  workflowId: string,
  payload: Record<string, unknown>,
): Promise<{ runId: string | null; status: string; error: string | null }> {
  const data = await client.request<{
    workflowRuntime: {
      fire: { runId: string | null; status: string; error: string | null };
    };
  }>(
    RUNTIME_PATH,
    `mutation Fire($workflowId: String!, $payload: Unknown) {
      workflowRuntime {
        fire(workflowId: $workflowId, payload: $payload) {
          runId
          status
          error
        }
      }
    }`,
    { workflowId, payload },
  );
  return data.workflowRuntime.fire;
}

export async function getRun(
  client: SwitchboardClient,
  runId: string,
): Promise<RunRecord | null> {
  const data = await client.request<{
    workflowRuntime: { run: RunRecord | null };
  }>(
    RUNTIME_PATH,
    `query Run($id: String!) {
      workflowRuntime {
        run(id: $id) {
          id
          status
          error
          steps { stepKey blockType status output error }
        }
      }
    }`,
    { id: runId },
  );
  return data.workflowRuntime.run;
}

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "PARKED"]);

// The persisted record, not the mutation's answer: the run is only proven once
// the journal says so.
export async function waitForRun(
  client: SwitchboardClient,
  runId: string,
  timeoutMs = 60_000,
): Promise<RunRecord> {
  const deadline = Date.now() + timeoutMs;
  let last: RunRecord | null = null;
  while (Date.now() < deadline) {
    last = await getRun(client, runId);
    if (last && TERMINAL.has(last.status)) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Run ${runId} did not reach a terminal status within ${timeoutMs}ms (last: ${JSON.stringify(last)})`,
  );
}
