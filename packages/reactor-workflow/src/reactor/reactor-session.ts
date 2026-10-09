// ctx.reactor on the host: one ReactorHostServer per piece request, serving a
// RunScopedReactorClient over the request's IPC transport (ADR 0005 §3).
import type {
  ReactorClient,
  ReadMethods,
  RefusedMethods,
  WriteMethods,
} from "@powerhousedao/pieces-framework";
import type { IReactorClient } from "@powerhousedao/reactor";
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

// A key per method, so a list change fails to compile.
const SERVED: Record<
  Exclude<ReadMethods | WriteMethods, WorkerMethods>,
  true
> = {
  get: true,
  resolveIdOrSlug: true,
  find: true,
  getOperations: true,
  getOutgoingRelationships: true,
  getIncomingRelationships: true,
  getOutgoingRelationshipEdges: true,
  getIncomingRelationshipEdges: true,
  create: true,
  createEmpty: true,
  execute: true,
  deleteDocument: true,
};

// Refused by name, so a piece learns why. `drives` has no methods to call.
const REFUSED: Record<Exclude<RefusedMethods, "drives">, true> = {
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
  executeAsync: true,
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
export function servedClient(client: ReactorClient): IReactorClient {
  const facade = Object.create(null) as Record<string, AnyMethod>;
  const methods = client as unknown as Record<string, AnyMethod>;
  for (const name of Object.keys(SERVED)) {
    facade[name] = (...args: unknown[]) => methods[name](...args);
  }
  for (const name of Object.keys(REFUSED)) {
    facade[name] = () => {
      throw refusedMethod(name);
    };
  }
  return facade as unknown as IReactorClient;
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
          ? tracedMethods(served, telemetry, "reactor", parent)
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
