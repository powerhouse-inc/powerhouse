// ctx.reactor on the host: one ReactorHostServer per piece request, serving a
// RunScopedReactorClient over the request's IPC transport (ADR 0005 §3).
import type {
  DriveReadMethods,
  DriveWriteHalfMethods,
  DriveWriteMethods,
  IndexQueryMethods,
  ReactorClient,
  ReadMethods,
  RefusedDriveMethods,
  RefusedMethods,
  RefusedWriteHalfMethods,
  WriteHalfMethods,
  WriteMethods,
} from "@powerhousedao/pieces-framework";
import type { IReactorClient, RemoteReads } from "@powerhousedao/reactor";
import {
  ReactorHostServer,
  type IRpcTransport,
} from "@powerhousedao/reactor/rpc";
import { context as otelContext } from "@opentelemetry/api";
import type { ReactorTap } from "../pieces/index.js";
import { tracedMethods, type WorkflowTelemetry } from "../telemetry.js";
import type { WorkflowRuntimeHostDeps } from "./host.js";
import { accessDenied, refusedMethod } from "./reactor-errors.js";
import type { ReactorRunScopeBase } from "./run-scope-builder.js";
import { currentDocumentRecorder, type RunScope } from "./run-scope.js";
import {
  RunScopedReactorClient,
  type RunScopedHostDeps,
  type RunScopedReactorClientOptions,
} from "./run-scoped-client.js";

// Answered by the worker's own registry: modules hold functions, which IPC cannot carry.
type WorkerMethods =
  | "getDocumentModelModules"
  | "getDocumentModelModule"
  | "getDocumentModelModuleForDocument";

// A key per method, so a list change fails to compile. `query` is the
// read-model index read the framework adds beside the client's own methods.
const SERVED: Record<
  Exclude<ReadMethods | WriteMethods, WorkerMethods> | keyof IndexQueryMethods,
  true
> = {
  get: true,
  resolveIdOrSlug: true,
  find: true,
  query: true,
  getOperations: true,
  getOutgoingRelationships: true,
  getIncomingRelationships: true,
  getOutgoingRelationshipEdges: true,
  getIncomingRelationshipEdges: true,
  newDocument: true,
  create: true,
  createEmpty: true,
  execute: true,
  executeAsync: true,
  deleteDocument: true,
};

const SERVED_DRIVES: Record<DriveReadMethods | DriveWriteMethods, true> = {
  getNode: true,
  listNodes: true,
  addFile: true,
  addFolder: true,
};

const REFUSED_DRIVES: Record<RefusedDriveMethods, true> = {
  create: true,
  removeNode: true,
  renameNode: true,
  moveNode: true,
  copyNode: true,
  setPreferredEditorOnNode: true,
};

const SERVED_WRITE: Record<WriteHalfMethods, true> = {
  create: true,
  createEmpty: true,
  execute: true,
  deleteDocument: true,
};

const SERVED_DRIVE_WRITES: Record<DriveWriteHalfMethods, true> = {
  addFile: true,
  addFolder: true,
};

const REFUSED_WRITE: Record<RefusedWriteHalfMethods, true> = {
  isDocumentIdTaken: true,
  describe: true,
  evaluateActions: true,
  upgradeDocument: true,
  executeBatch: true,
  rename: true,
  setPreferredEditor: true,
  addRelationship: true,
  updateRelationship: true,
  removeRelationship: true,
  moveRelationship: true,
  deleteDocuments: true,
  loadBatch: true,
};

// What the piece's write handles call; the client admits only its own jobs.
const SERVED_READ: Record<keyof RemoteReads, true> = {
  waitForJob: true,
  getJobStatus: true,
  get: true,
};

// Refused by name, so a piece learns why. `read` serves only its handles.
const REFUSED: Record<Exclude<RefusedMethods, "read">, true> = {
  getMany: true,
  createDocumentInDrive: true,
  executeBatch: true,
  rename: true,
  setPreferredEditor: true,
  addRelationship: true,
  updateRelationship: true,
  removeRelationship: true,
  moveRelationship: true,
  upgradeDocument: true,
  deleteDocuments: true,
  createAsync: true,
  createEmptyAsync: true,
  getJobStatus: true,
  waitForJob: true,
  subscribe: true,
  loadBatch: true,
  evaluateActions: true,
  isDocumentIdTaken: true,
  isServed: true,
  getCreateSignaturePolicy: true,
  getCreateProtocolVersions: true,
};

type AnyMethod = (...args: unknown[]) => unknown;

// The server calls any method of the client it holds, so it holds only these:
// no prototype, and none of the wrapper's internals.
export function servedClient(
  client: ReactorClient & { read?: RemoteReads },
): IReactorClient & IndexQueryMethods {
  const facade = served(
    client as unknown as Record<string, AnyMethod>,
    SERVED,
    REFUSED,
    "",
  ) as Record<string, unknown>;
  facade.drives = served(
    client.drives as unknown as Record<string, AnyMethod>,
    SERVED_DRIVES,
    REFUSED_DRIVES,
    "drives.",
  );
  const write = served(
    client.write as unknown as Record<string, AnyMethod>,
    SERVED_WRITE,
    REFUSED_WRITE,
    "write.",
  ) as Record<string, unknown>;
  write.drives = served(
    client.write.drives as unknown as Record<string, AnyMethod>,
    SERVED_DRIVE_WRITES,
    REFUSED_DRIVES,
    "write.drives.",
  );
  facade.write = write;
  if (client.read) {
    facade.read = served(
      client.read as unknown as Record<string, AnyMethod>,
      SERVED_READ,
      {},
      "read.",
    );
  }
  return facade as unknown as IReactorClient & IndexQueryMethods;
}

function served(
  methods: Record<string, AnyMethod>,
  serve: Record<string, true>,
  refuse: Record<string, true>,
  prefix: string,
): Record<string, AnyMethod> {
  const facade = Object.create(null) as Record<string, AnyMethod>;
  for (const name of Object.keys(serve)) {
    facade[name] = (...args: unknown[]) => methods[name](...args);
  }
  for (const name of Object.keys(refuse)) {
    facade[name] = () => {
      throw refusedMethod(prefix + name);
    };
  }
  return facade;
}

// The run's journal: documents a step reads or writes, and a write's
// documents at submit, go to the run's run_document rows.
export function runJournal(): RunScope["journal"] {
  const record = currentDocumentRecorder();
  return {
    recordDocuments: (documentIds) =>
      record ? record(documentIds) : Promise.resolve(),
    recordJob: (_jobId, documentIds) =>
      record ? record(documentIds) : Promise.resolve(),
  };
}

export const NO_JOURNAL: RunScope["journal"] = {
  recordDocuments: () => Promise.resolve(),
  recordJob: () => Promise.resolve(),
};

export type ReactorSessionHost = RunScopedHostDeps &
  Pick<WorkflowRuntimeHostDeps, "reactorClient" | "hostPrincipal">;

// Serves one request: the deadline is the request's, the rest decided before.
export function reactorTap(
  host: ReactorSessionHost,
  base: ReactorRunScopeBase,
  journal: RunScope["journal"],
  options: RunScopedReactorClientOptions = {},
  telemetry?: WorkflowTelemetry,
): ReactorTap {
  // Documents a run creates also grant the host, so it can keep writing them.
  const clientOptions: RunScopedReactorClientOptions = {
    ...(host.hostPrincipal ? { hostPrincipal: host.hostPrincipal } : {}),
    ...options,
  };
  return {
    requireReactor: base.requireReactor,
    open(transport, { deadline }) {
      const client = new RunScopedReactorClient(
        host.reactorClient,
        { ...base, deadline, journal },
        host,
        clientOptions,
      );
      const served = servedClient(client);
      // RPC calls arrive as IPC events, outside the step's async context.
      const parent = otelContext.active();
      const server = new ReactorHostServer(
        telemetry
          ? tracedMethods(served, telemetry, "reactor", parent, [
              "drives",
              "write",
              "read",
            ])
          : served,
        transport as unknown as IRpcTransport,
      );
      server.start();
      return () => server.stop();
    },
  };
}

// A design-time resolver reads as the caller, and never writes.
export function designTimeScope(
  runUser: ReactorRunScopeBase["runUser"],
): ReactorRunScopeBase {
  return { runUser, requireReactor: "read", connection: { access: "read" } };
}

export function unboundReactorConnection(reactorConnectionId: string): Error {
  return accessDenied(
    `Reactor connection "${reactorConnectionId}" must name a connection, not an expression`,
  );
}
