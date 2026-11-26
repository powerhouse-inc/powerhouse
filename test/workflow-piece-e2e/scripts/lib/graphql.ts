// The switchboard surface this suite drives: the workflow document, authored
// with actions the suite signs itself (a switchboard signs no write for its
// callers), and the runtime subgraph to run and read it.
import { GraphQLReactorClient } from "@powerhousedao/reactor-browser/graphql-client";
import type { Action } from "@powerhousedao/shared/document-model";
import { testSigner } from "@powerhousedao/shared/testing";
import {
  addEdge,
  addStep,
  publishWorkflow,
  setTrigger,
  setWorkflowName,
  setWorkflowStatus,
  Workflow,
} from "@powerhousedao/workflow/document-models/workflow";

/** The address the suite's own writes are signed for. */
export const E2E_WRITER_ADDRESS = "0x00000000000000000000000000000000000000e4";

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
  #writer: Promise<GraphQLReactorClient> | undefined;

  constructor(private readonly baseUrl: string) {}

  /** Writes to the switchboard as the suite's own signer, as a Powerhouse client does. */
  writer(): Promise<GraphQLReactorClient> {
    this.#writer ??= testSigner(E2E_WRITER_ADDRESS, {
      app: "workflow-piece-e2e",
    }).then(
      (signer) =>
        new GraphQLReactorClient({
          url: `${this.baseUrl}/graphql`,
          signer,
          documentModels: [Workflow],
          realtime: false,
        }),
    );
    return this.#writer;
  }

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
  pieceName: string;
  pieceVersion: string;
  name: string;
  displayName: string;
  kind: string;
}

export interface PieceSearchMatch {
  pieceName: string;
  pieceVersion: string;
  source: string;
  blocks: BlockSearchHit[];
}

export interface PieceSearchResult {
  status: string;
  pieces: PieceSearchMatch[];
  indexedPieces: number;
  error: string | null;
}

export interface StepRunRecord {
  stepKey: string;
  pieceName: string;
  blockName: string;
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

// Actions only: the fixture piece has no triggers.
export async function searchPieces(
  client: SwitchboardClient,
  query: string,
): Promise<PieceSearchResult> {
  const data = await client.request<{
    workflowRuntime: { searchPieces: PieceSearchResult };
  }>(
    RUNTIME_PATH,
    `query Search($query: String!) {
      workflowRuntime {
        searchPieces(query: $query, kind: "action") {
          status
          indexedPieces
          error
          pieces {
            pieceName pieceVersion source
            blocks { pieceName pieceVersion name displayName kind }
          }
        }
      }
    }`,
    { query },
  );
  return data.workflowRuntime.searchPieces;
}

// The index builds lazily on first use, so a "indexing" answer is polled out
// rather than treated as a miss.
export async function searchPiecesWhenReady(
  client: SwitchboardClient,
  query: string,
  timeoutMs = 60_000,
): Promise<PieceSearchResult> {
  const deadline = Date.now() + timeoutMs;
  let last: PieceSearchResult | undefined;
  while (Date.now() < deadline) {
    last = await searchPieces(client, query);
    if (last.status !== "indexing") return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `searchPieces("${query}") was still indexing after ${timeoutMs}ms (last: ${JSON.stringify(last)})`,
  );
}

export interface WorkflowStepInput {
  id: string;
  key: string;
  name: string;
  pieceName: string;
  pieceVersion: string;
  actionName: string;
  config: Record<string, unknown>;
}

export interface WorkflowInput {
  name: string;
  trigger: {
    id: string;
    pieceName: string;
    pieceVersion: string;
    triggerName: string;
    config: Record<string, unknown>;
  };
  steps: WorkflowStepInput[];
  edges: { id: string; from: string; to: string; port: string }[];
}

// Authored the way a client authors one: create the document, then one
// signed action per structural edit, then enable it.
export async function createWorkflow(
  client: SwitchboardClient,
  input: WorkflowInput,
): Promise<string> {
  const writer = await client.writer();
  const created = await writer.create(
    await writer.newDocument(Workflow.documentModel.global.id, {
      name: input.name,
    }),
  );
  const id = created.header.id;
  const write = async (action: Action) => {
    await writer.execute(id, "main", [action]);
  };

  await write(setWorkflowName({ name: input.name }));
  await write(setTrigger(input.trigger));
  for (const step of input.steps) {
    await write(addStep(step));
  }
  for (const edge of input.edges) {
    await write(addEdge(edge));
  }
  // Enabling requires a published snapshot.
  await write(publishWorkflow({ publishedAt: new Date().toISOString() }));
  await write(setWorkflowStatus({ status: "ENABLED" }));

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
          steps { stepKey pieceName blockName status output error }
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
