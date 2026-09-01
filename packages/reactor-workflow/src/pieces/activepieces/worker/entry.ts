// Worker child: loads piece bundles and executes actions in an isolated
// process, so piece side-effects (TLS env poisoning, crashes) never reach the host.
import {
  buildActionContext,
  InMemoryConnectionsProvider,
  InMemoryKeyValueStore,
  UnsupportedContextMemberError,
} from "../context/action.js";
import {
  buildPropertyContext,
  resolveDynamicProperty,
} from "../context/props.js";
import { loadPieceFromDir, type LoadedPiece } from "../loader.js";
import { getActions } from "../types.js";
import type {
  ResolveOptionsMessage,
  RunMessage,
  SerializedPieceError,
  WorkerRequestMessage,
  WorkerResponse,
} from "./protocol.js";

const loadedPieces = new Map<string, Promise<LoadedPiece>>();
// One store per scope, alive for the worker's lifetime (in-memory phase:
// state survives runs but not worker replacement).
const stores = new Map<string, InMemoryKeyValueStore>();

function storeForScope(scope: string): InMemoryKeyValueStore {
  let store = stores.get(scope);
  if (!store) {
    store = new InMemoryKeyValueStore();
    stores.set(scope, store);
  }
  return store;
}

function loadCached(bundleDir: string): Promise<LoadedPiece> {
  let loading = loadedPieces.get(bundleDir);
  if (!loading) {
    loading = loadPieceFromDir(bundleDir);
    loadedPieces.set(bundleDir, loading);
  }
  return loading;
}

function jsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return String(value);
  }
}

function serializeError(error: unknown): SerializedPieceError {
  const properties: Record<string, unknown> = {};
  if (typeof error === "object" && error !== null) {
    for (const key of Object.keys(error)) {
      properties[key] = jsonSafe((error as Record<string, unknown>)[key]);
    }
  }
  return {
    name:
      (typeof error === "object" && error !== null && error.constructor.name) ||
      "Error",
    message: String(
      typeof error === "object" && error !== null && "message" in error
        ? (error as { message: unknown }).message
        : error,
    ),
    properties,
    unsupportedMember:
      error instanceof UnsupportedContextMemberError ? error.member : undefined,
  };
}

// Read-and-clear the piece-set TLS override so each run reports its own poisoning.
function consumeTlsFlag(): boolean {
  const poisoned = process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  return poisoned;
}

async function handleResolveOptions(
  message: ResolveOptionsMessage,
): Promise<WorkerResponse> {
  const { request } = message;
  const { piece } = await loadCached(request.bundleDir);
  const { context, touched } = buildPropertyContext({
    searchValue: request.searchValue,
    // Design-time default: an empty flows listing instead of a throwing stub.
    flows: { list: () => Promise.resolve({ data: [] }) },
  });
  const refresherValues = {
    ...(request.auth !== undefined ? { auth: request.auth } : {}),
    ...request.refresherValues,
  };
  const output = await resolveDynamicProperty({
    piece,
    actionName: request.actionName,
    propName: request.propName,
    refresherValues,
    context,
  });
  return {
    id: message.id,
    type: "result",
    output: jsonSafe(output),
    touched: [...touched],
    tlsPoisoned: consumeTlsFlag(),
  };
}

async function handleRun(message: RunMessage): Promise<WorkerResponse> {
  const { request } = message;
  const { piece } = await loadCached(request.bundleDir);
  const action = getActions(piece)[request.actionName] as
    | ReturnType<typeof getActions>[string]
    | undefined;
  if (!action) {
    throw new Error(
      `No action "${request.actionName}" in bundle ${request.bundleDir}`,
    );
  }
  const { context, touched } = buildActionContext({
    propsValue: request.propsValue,
    auth: request.auth,
    store: request.storeScope ? storeForScope(request.storeScope) : undefined,
    connections: request.connections
      ? new InMemoryConnectionsProvider(request.connections)
      : undefined,
    executionType: request.executionType,
    identity: request.identity,
  });
  const output = await action.run(context);
  return {
    id: message.id,
    type: "result",
    output: jsonSafe(output),
    touched: [...touched],
    tlsPoisoned: consumeTlsFlag(),
  };
}

function isWorkerMessage(value: unknown): value is WorkerRequestMessage {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === "run" || type === "resolve-options";
}

process.on("message", (message: unknown) => {
  if (!isWorkerMessage(message)) return;
  const handler =
    message.type === "run" ? handleRun(message) : handleResolveOptions(message);
  handler
    .catch(
      (error: unknown): WorkerResponse => ({
        id: message.id,
        type: "error",
        error: serializeError(error),
        tlsPoisoned: consumeTlsFlag(),
      }),
    )
    .then((response) => process.send?.(response))
    .catch(() => process.exit(1));
});
