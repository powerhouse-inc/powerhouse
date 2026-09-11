// Worker child: loads piece bundles and executes actions in an isolated
// process, so piece side-effects (TLS env poisoning, crashes) never reach the host.
import {
  buildActionContext,
  InMemoryConnectionsProvider,
  InMemoryKeyValueStore,
  UnsupportedContextMemberError,
} from "../context/action.js";
import { RemoteKeyValueStore } from "../context/remote-store.js";
import { RemoteOutput } from "../context/remote-output.js";
import { captureConsole } from "./logs.js";
import { jsonSafe } from "./json-safe.js";
import { readFile } from "node:fs/promises";
import { buildCheckConnectionContext } from "../context/check.js";
import {
  DataUriFilesService,
  StagedFilesService,
} from "../context/files.js";
import {
  normalizePropsValue,
  type NormalizeOptions,
} from "../context/normalize.js";
import {
  buildPropertyContext,
  findProperty,
  resolveDynamicProperty,
} from "../context/props.js";
import { buildTriggerContext, runTriggerHook } from "../context/trigger.js";
import { buildDescriptor, describeProperties } from "../descriptor.js";
import { loadPieceFromDir, type LoadedPiece } from "../loader.js";
import { getActions, getTriggers, type ApProperty } from "../types.js";
import type {
  StagedInput,
  CheckConnectionMessage,
  CheckConnectionOutcome,
  DescribePieceMessage,
  ResolveOptionsMessage,
  RunMessage,
  SerializedPieceError,
  TriggerHookMessage,
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
  const prop = findProperty(
    piece,
    request.actionName,
    request.propName,
    request.kind,
  );
  const output = await resolveDynamicProperty({
    piece,
    actionName: request.actionName,
    kind: request.kind,
    propName: request.propName,
    refresherValues,
    context,
  });
  // DYNAMIC props() yields raw piece properties (with resolver functions);
  // the editor only ever sees descriptors, so translate before crossing IPC.
  const isDynamic =
    typeof prop.props === "function" && typeof prop.options !== "function";
  return {
    id: message.id,
    type: "result",
    output: isDynamic
      ? describeProperties(output as Record<string, ApProperty> | undefined)
      : jsonSafe(output),
    touched: [...touched],
    tlsPoisoned: consumeTlsFlag(),
  };
}

// Reads a FILE prop's attachment ref from the copy the host staged on disk.
// The fork shares the filesystem with its parent, so this is what keeps a
// 50 MB scan out of the IPC channel in both directions.
function stagedInputResolver(
  inputs: StagedInput[] | undefined,
): NormalizeOptions["resolveRef"] {
  if (!inputs || inputs.length === 0) return undefined;
  const byRef = new Map(inputs.map((input) => [input.ref, input]));
  return async (ref: string) => {
    const staged = byRef.get(ref);
    if (!staged) {
      throw new Error(`No staged file for reference "${ref}"`);
    }
    return {
      data: await readFile(staged.path),
      filename: staged.fileName,
      contentType: staged.contentType,
    };
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
  const files = request.stagingDir
    ? new StagedFilesService(request.stagingDir)
    : new DataUriFilesService();
  // A durable store answers every get/put over the call channel, so a write
  // survives this worker; without one the value lives only in this heap.
  const durableStore = request.durableStore
    ? new RemoteKeyValueStore()
    : undefined;
  const liveOutput = request.liveOutput ? new RemoteOutput() : undefined;
  const { context, touched } = buildActionContext({
    propsValue: await normalizePropsValue(action.props, request.propsValue, {
      resolveRef: stagedInputResolver(request.stagedInputs),
    }),
    auth: request.auth,
    store:
      durableStore ??
      (request.storeScope ? storeForScope(request.storeScope) : undefined),
    files,
    connections: request.connections
      ? new InMemoryConnectionsProvider(request.connections)
      : undefined,
    output: liveOutput,
    executionType: request.executionType,
    identity: request.identity,
  });
  const restoreConsole = request.captureLogs ? captureConsole() : undefined;
  let output: unknown;
  try {
    output = await action.run(context);
  } finally {
    restoreConsole?.();
    liveOutput?.close();
  }
  return {
    id: message.id,
    type: "result",
    output: jsonSafe(output),
    ...(files instanceof StagedFilesService && files.staged().length > 0
      ? { files: files.staged() }
      : {}),
    touched: [...touched],
    tlsPoisoned: consumeTlsFlag(),
  };
}

async function handleTriggerHook(
  message: TriggerHookMessage,
): Promise<WorkerResponse> {
  const { request } = message;
  const { piece } = await loadCached(request.bundleDir);
  const trigger = getTriggers(piece)[request.triggerName] as
    | ReturnType<typeof getTriggers>[string]
    | undefined;
  if (!trigger) {
    throw new Error(
      `No trigger "${request.triggerName}" in bundle ${request.bundleDir}`,
    );
  }
  const store = new InMemoryKeyValueStore(request.storeState);
  const runsPiece = request.hook === "run" || request.hook === "test";
  const handle = buildTriggerContext({
    propsValue: await normalizePropsValue(trigger.props, request.propsValue),
    auth: request.auth,
    store,
    // Test hooks write under a separate prefix, never the live cursor.
    storePrefix: request.hook === "test" ? "test" : "",
    identity: request.identity,
    isRepublish: request.isRepublish,
    payload: request.payload,
    webhookUrl: request.webhookUrl,
    server: request.server,
    files: runsPiece ? new DataUriFilesService() : undefined,
  });
  const output = await runTriggerHook(trigger, request.hook, handle);
  return {
    id: message.id,
    type: "result",
    output: jsonSafe(output),
    touched: [...handle.touched],
    tlsPoisoned: consumeTlsFlag(),
    storeState: jsonSafe(store.snapshot()) as Record<string, unknown>,
    schedules: handle.schedules,
    listeners: handle.listeners,
  };
}

async function handleCheckConnection(
  message: CheckConnectionMessage,
): Promise<WorkerResponse> {
  const { request } = message;
  const { piece } = await loadCached(request.bundleDir);
  const app = piece as {
    checkConnection?: (context: unknown) => unknown;
  };
  if (typeof app.checkConnection !== "function") {
    const outcome: CheckConnectionOutcome = { declared: false };
    return {
      id: message.id,
      type: "result",
      output: outcome,
      touched: [],
      tlsPoisoned: consumeTlsFlag(),
    };
  }
  const { context, touched } = buildCheckConnectionContext({
    auth: request.auth,
  });
  const result = await app.checkConnection(context);
  const outcome: CheckConnectionOutcome = {
    declared: true,
    result: jsonSafe(result),
  };
  return {
    id: message.id,
    type: "result",
    output: outcome,
    touched: [...touched],
    tlsPoisoned: consumeTlsFlag(),
  };
}

async function handleDescribe(
  message: DescribePieceMessage,
): Promise<WorkerResponse> {
  const { request } = message;
  const { piece } = await loadCached(request.bundleDir);
  const descriptor = buildDescriptor(piece, {
    packageName: request.packageName,
    version: request.version,
  });
  return {
    id: message.id,
    type: "result",
    // A prop's defaultValue is piece-authored; jsonSafe keeps a non-cloneable
    // one from failing the IPC send.
    output: jsonSafe(descriptor),
    touched: [],
    tlsPoisoned: consumeTlsFlag(),
  };
}

function isWorkerMessage(value: unknown): value is WorkerRequestMessage {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "run" ||
    type === "resolve-options" ||
    type === "trigger-hook" ||
    type === "check-connection" ||
    type === "describe"
  );
}

function dispatch(message: WorkerRequestMessage): Promise<WorkerResponse> {
  switch (message.type) {
    case "run":
      return handleRun(message);
    case "resolve-options":
      return handleResolveOptions(message);
    case "trigger-hook":
      return handleTriggerHook(message);
    case "check-connection":
      return handleCheckConnection(message);
    case "describe":
      return handleDescribe(message);
  }
}

process.on("message", (message: unknown) => {
  if (!isWorkerMessage(message)) return;
  const handler = dispatch(message);
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
