// Scaffold file meant for customization; delete and re-run codegen to reset.
import type { BlockRef } from "@powerhousedao/pieces-framework/block-type";
import type { WorkflowRuntimeHostDeps } from "./host.js";
import {
  ActivepiecesBlockExecutor,
  BoundConnectionResolver,
  CompositeBlockExecutor,
  sourcedResolver,
  shapeConnection,
  type BlockExecutor,
  type ConnectionAuthType,
  type ConnectionRequest,
  type EngineConnectionResolver,
  type AttachmentPort,
  type BlockResolution,
  type PieceResolver,
  type PieceStorePort,
  type ResolvedConnection,
  type EgressPolicy,
  type SecretProvider,
  type WorkflowDefinition,
} from "../pieces/index.js";
import type {
  ConnectionDocument,
  ConnectionState,
} from "@powerhousedao/workflow/document-models/connection";
import type { WorkflowState } from "@powerhousedao/workflow/document-models/workflow";
import { childLogger } from "document-model";
import { join } from "node:path";
import {
  currentBoundConnections,
  currentPieceWorker,
  currentRunId,
  currentWorkflowId,
} from "./run-scope.js";
import { PROJECT_SCOPE_KEY } from "./piece-store-port.js";
import { packagePieces } from "./piece-registry.js";
import { SubgraphReactorPort } from "./reactor-port.js";
import { packageFromConnectorId } from "./connector-id.js";
import { runnableDefinition, type RunnableDefinition } from "./runnable.js";

const pieceLogger = childLogger(["workflow", "piece"]);
const connectionLogger = childLogger(["workflow", "connection"]);

// A connection is bound to its connector (doc 08 §10): a step of one piece
// never receives another piece's credentials.

// Absent information refuses. A caller that named no piece, or a connection
// whose connectorId is blank, leaves nothing to check against.
function assertConnectorMatches(
  state: ConnectionState,
  request: ConnectionRequest | undefined,
): void {
  const wanted = request?.piecePackage;
  const owner = state.connectorId
    ? packageFromConnectorId(state.connectorId)
    : "";
  if (!wanted || !owner || wanted !== owner) {
    throw new ConnectorMismatchError();
  }
}

// Says only that this connection is not this caller's to use: naming the
// owning package would tell an author which connector a guessed id belongs to.
export class ConnectorMismatchError extends Error {
  constructor() {
    super("Connection is not available to this block");
    this.name = "ConnectorMismatchError";
  }
}

// Resolves a step's connectionId to a powerhouse/connection document and
// shapes its auth value; secret refs resolve through the managed store.
export class DocumentConnectionResolver implements EngineConnectionResolver {
  constructor(
    private readonly host: WorkflowRuntimeHostDeps,
    private readonly secrets: SecretProvider,
  ) {}

  async resolve(
    connectionId: string,
    request?: ConnectionRequest,
  ): Promise<unknown> {
    return (await this.resolveWithSecrets(connectionId, request)).auth;
  }

  // The secret half is what journal redaction matches on, so it is resolved
  // here rather than guessed from the shaped auth value.
  async resolveWithSecrets(
    connectionId: string,
    request?: ConnectionRequest,
  ): Promise<ResolvedConnection> {
    const document =
      await this.host.reactorClient.get<ConnectionDocument>(connectionId);
    return resolveConnectionWithSecrets(document, this.secrets, request);
  }
}

// The one place that decides whether a connection's credentials may be shaped
// at all. Takes the document so a caller holding one need not fetch it twice.
export async function resolveConnectionAuth(
  document: ConnectionDocument,
  secrets: SecretProvider,
  request?: ConnectionRequest,
): Promise<unknown> {
  return (await resolveConnectionWithSecrets(document, secrets, request)).auth;
}

// The same resolution, with the concrete secret strings the journal redacts
// on. It runs every check above it: getting the secrets is not a way around
// the question of who is asking.
export async function resolveConnectionWithSecrets(
  document: ConnectionDocument,
  secrets: SecretProvider,
  request?: ConnectionRequest,
): Promise<ResolvedConnection> {
  // Nothing before the connector check describes what was found: a document
  // of the wrong type answers exactly as a foreign connection does.
  if (document.header.documentType !== "powerhouse/connection") {
    throw new ConnectorMismatchError();
  }
  const state: ConnectionState = document.state.global;
  assertConnectorMatches(state, request);
  // Past the check the caller already holds this connection, so the reason it
  // cannot be used is theirs to see.
  if (state.status === "REVOKED") {
    throw new Error(
      `Connection "${state.name || document.header.id}" is revoked`,
    );
  }
  return shapeConnection(
    {
      authType: state.authType as ConnectionAuthType,
      config: (state.config ?? {}) as Record<string, unknown>,
      secretRefs: state.secretRefs,
    },
    secrets,
  );
}

// Piece code runs under an egress policy that denies private address space —
// loopback, the RFC1918 ranges, the cloud metadata endpoint — because a piece
// config is an SSRF surface and a workflow author is not always the operator.
//
// A reactor co-hosted with what it integrates has to widen that, or every one
// of its connections is unreachable: a local demo pointing at
// http://localhost:18081 fails at the first poll, and so does the dropdown that
// would have offered it. The widening names addresses rather than switching the
// guard off, so allowing a demo's loopback services leaves the rest of private
// space — and the metadata endpoint — denied.
//
//   PH_WORKFLOWS_EGRESS_ALLOW_ADDRESSES=127.0.0.1/32,::1/128
//
// Unset, the default policy applies and nothing private is reachable.
const EGRESS_ALLOW_ENV = "PH_WORKFLOWS_EGRESS_ALLOW_ADDRESSES";

// A bare address is one host, not a guess at the network around it.
function asCidr(entry: string): string {
  if (entry.includes("/")) return entry;
  return entry.includes(":") ? `${entry}/128` : `${entry}/32`;
}

export function configuredEgress(): EgressPolicy | undefined {
  const raw = process.env[EGRESS_ALLOW_ENV];
  if (raw === undefined || raw.trim() === "") return undefined;
  const allowAddresses = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map(asCidr);
  if (allowAddresses.length === 0) return undefined;
  pieceLogger.info(
    `Egress policy widened by ${EGRESS_ALLOW_ENV}: ${allowAddresses.join(", ")}`,
  );
  return { allowAddresses };
}

let bundleCache = join(process.cwd(), ".ph", "ap-bundles");

export function bundleCacheDir(): string {
  return bundleCache;
}

// Test seam: a suite keeps its fetched bundles apart from every other suite.
export function setBundleCacheDir(dir: string): void {
  bundleCache = dir;
  resolver = undefined;
}

// Where a piece's ctx.files output and its staged attachment inputs live for
// the length of one step. Under .ph so a host can sweep it on startup after a
// crash; the executor removes each step's directory itself.
export const ATTACHMENT_STAGING_DIR = join(
  process.cwd(),
  ".ph",
  "ap-attachment-staging",
);

// Fetches a piece from the source its resolution chose. One instance: a run
// and the editor must load the same bytes for the same resolution.
let resolver: PieceResolver | undefined;

export function pieceResolver(): PieceResolver {
  return (resolver ??= sourcedResolver({
    cacheDir: bundleCacheDir(),
    // Asked per call: the host refills the registry as packages change.
    lookup: (name) => packagePieces.lookup(name),
  }));
}

// The executor is shared by every concurrent run, so the binding travels with
// the run scope rather than sitting on the resolver.
export function boundConnections(
  inner: EngineConnectionResolver,
): EngineConnectionResolver {
  return new BoundConnectionResolver(
    inner,
    currentBoundConnections,
    (connectionId, request) => {
      // Named apart from a missing connection so an operator can tell a
      // misconfigured step from an attempt to reach a foreign credential.
      connectionLogger.warn(
        `Step "${request?.stepKey ?? "?"}" of workflow "${currentWorkflowId() ?? "?"}" asked for connection "${connectionId}", which its definition does not declare`,
      );
    },
  );
}

export function createBlockExecutor(
  host: WorkflowRuntimeHostDeps,
  secrets: SecretProvider,
  attachments?: AttachmentPort,
  pieceStore?: PieceStorePort,
  // The runtime's resolution policy, shared with triggers and design time.
  resolveBlock?: (block: BlockRef) => Promise<BlockResolution>,
): BlockExecutor {
  // No handler map: the document blocks are a piece now, and they reach the
  // reactor through the port below like any other package piece would.
  return new CompositeBlockExecutor(
    new ActivepiecesBlockExecutor({
      cacheDir: bundleCacheDir(),
      // Undefined leaves the connectors' default policy in force; a value only
      // ever widens it.
      egress: configuredEgress(),
      // Asked per step, for the same reason the binding is: one executor,
      // many runs, and each run has a child of its own.
      worker: currentPieceWorker,
      // A workflow is a flow; the reactor is the project, as it is for
      // ctx.store's PROJECT scope.
      identity: () => ({
        runId: currentRunId(),
        flowId: currentWorkflowId(),
        projectId: PROJECT_SCOPE_KEY,
      }),
      resolver: pieceResolver(),
      ...(resolveBlock ? { resolveBlock } : {}),
      // Served only to a piece this reactor's packages ship; the executor
      // withholds it from everything the resolver fetched.
      reactor: new SubgraphReactorPort(host),
      connections: boundConnections(
        new DocumentConnectionResolver(host, secrets),
      ),
      // Without it an action's ctx.store lives only in the worker's heap.
      ...(pieceStore ? { pieceStore } : {}),
      // The worker's stdio is discarded, so a piece's own console output is
      // invisible until it is forwarded here.
      onPieceLog: (entry, execution) => {
        const line = `[${execution.step.key}] ${entry.message}`;
        if (entry.level === "error") pieceLogger.error(line);
        else if (entry.level === "warn") pieceLogger.warn(line);
        else if (entry.level === "debug") pieceLogger.debug(line);
        else pieceLogger.info(line);
      },
      // Without an attachment store a piece's ctx.files still works, but
      // inline as a data URI; with one, bytes go to the store and the output
      // carries a reference.
      ...(attachments
        ? { attachments, stagingRoot: ATTACHMENT_STAGING_DIR }
        : {}),
    }),
  );
}

export function propertySettings(
  settings:
    | readonly { prop: string; mode: string; schema?: unknown }[]
    | null
    | undefined,
): WorkflowDefinition["steps"][number]["propertySettings"] {
  return settings?.map((setting) => ({
    prop: setting.prop,
    mode: setting.mode,
    schema: setting.schema ?? null,
  }));
}

// One runnable step in engine shape.
export function stepDefinition(
  step: RunnableDefinition["steps"][number],
): WorkflowDefinition["steps"][number] {
  return {
    id: step.id,
    key: step.key,
    name: step.name,
    pieceName: step.pieceName,
    pieceVersion: step.pieceVersion,
    actionName: step.actionName,
    connectionId: step.connectionId,
    config: step.config,
    timeoutSeconds: step.timeoutSeconds,
    propertySettings: propertySettings(step.propertySettings),
    skip: step.skip,
  };
}

// The runnable definition (see runnable.ts) in engine shape.
export function toWorkflowDefinition(state: WorkflowState): WorkflowDefinition {
  const runnable = runnableDefinition(state);
  if (!runnable.trigger) {
    throw new Error("Workflow has no trigger binding");
  }
  return {
    name: state.name,
    trigger: {
      id: runnable.trigger.id,
      pieceName: runnable.trigger.pieceName,
      pieceVersion: runnable.trigger.pieceVersion,
      triggerName: runnable.trigger.triggerName,
      connectionId: runnable.trigger.connectionId,
      config: runnable.trigger.config,
      propertySettings: propertySettings(runnable.trigger.propertySettings),
    },
    steps: runnable.steps.map(stepDefinition),
    edges: runnable.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      port: edge.port,
      condition: edge.condition,
    })),
    variables: runnable.variables.map((variable) => ({
      key: variable.key,
      value: variable.value,
    })),
  };
}
