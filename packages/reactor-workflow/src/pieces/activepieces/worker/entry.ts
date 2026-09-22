// Worker child: loads piece bundles and executes actions in an isolated
// process, so piece side-effects (TLS env poisoning, crashes) never reach the host.
import {
  buildActionContext,
  InMemoryConnectionsProvider,
  InMemoryKeyValueStore,
  UnsupportedContextMemberError,
} from "../context/action.js";
import { RemoteKeyValueStore } from "../context/remote-store.js";
import { RemoteReactorService } from "../context/reactor.js";
import { RemoteOutput } from "../context/remote-output.js";
import { captureConsole } from "./logs.js";
import { jsonSafe } from "./json-safe.js";
import { formatPieceError } from "@powerhousedao/pieces-framework/host";
import { redactError, redactMessage } from "./redact.js";
import { readFile } from "node:fs/promises";
import { buildCheckConnectionContext } from "../context/check.js";
import { DataUriFilesService, StagedFilesService } from "../context/files.js";
import { setMaxFileBytes } from "../context/limits.js";
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
import { loadPiece, loadPieceFromDir, type LoadedPiece } from "../loader.js";
import { getActions, getTriggers, type ApProperty } from "../types.js";
import { installEgressGuard, runWithEgressPolicy } from "./egress.js";
import type {
  StagedInput,
  PieceModuleRef,
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

// Before any piece module is loaded, so a piece cannot keep a pristine copy of
// the socket layer from a request that carried no policy.
installEgressGuard();

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

// The module this request names, and the cache key for it. A package piece
// arrives as one file; a fetched bundle as the directory holding it.
function pieceRefKey(ref: PieceModuleRef): string {
  const key = ref.entryPath ?? ref.bundleDir;
  if (!key) {
    throw new Error("Request names no piece module (entryPath or bundleDir)");
  }
  return key;
}

function loadCached(ref: PieceModuleRef): Promise<LoadedPiece> {
  const key = pieceRefKey(ref);
  let loading = loadedPieces.get(key);
  if (!loading) {
    loading = ref.entryPath ? loadPiece(key) : loadPieceFromDir(key);
    loadedPieces.set(key, loading);
  }
  return loading;
}

// The secret values this request carried, if any. Redacting here rather than
// on the host means the host process never holds them in an error object.
function redactValuesOf(message: WorkerRequestMessage): string[] {
  const request = message.request as { redactValues?: string[] };
  return request.redactValues ?? [];
}

function serializeError(
  error: unknown,
  values: string[] = [],
): SerializedPieceError {
  const properties: Record<string, unknown> = {};
  if (typeof error === "object" && error !== null) {
    for (const key of Object.keys(error)) {
      properties[key] = jsonSafe((error as Record<string, unknown>)[key]);
    }
  }
  // The framework's own formatter first: it lifts an HTTP status, the request
  // and response, and a message out of an HTML error page. Redaction stays last.
  const { __apErrorVersion, message, errorName, ...http } =
    formatPieceError(error);
  return {
    name:
      (typeof error === "object" && error !== null && error.constructor.name) ||
      errorName ||
      "Error",
    message: redactMessage(message, { values }),
    properties: redactError(
      { ...properties, ...(jsonSafe(http) as Record<string, unknown>) },
      { values },
    ) as Record<string, unknown>,
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
  const { piece } = await loadCached(request);
  const { context, touched } = buildPropertyContext({
    searchValue: request.searchValue,
    // Design-time default: an empty flows listing instead of a throwing stub.
    flows: { list: () => Promise.resolve({ data: [] }) },
    ...(request.reactorAccess ? { reactor: new RemoteReactorService() } : {}),
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
  // An empty list is not the same as no list: it means the host has a store
  // and tried, so a FILE prop that still comes up short is told which
  // reference failed rather than that the context has no resolver.
  if (!inputs) return undefined;
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
  const { piece } = await loadCached(request);
  const action = getActions(piece)[request.actionName] as
    | ReturnType<typeof getActions>[string]
    | undefined;
  if (!action) {
    throw new Error(
      `No action "${request.actionName}" in ${pieceRefKey(request)}`,
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
  // Host-served reactor access, for a piece that ships inside a reactor package.
  const reactor = request.reactorAccess
    ? new RemoteReactorService()
    : undefined;
  // Before the props are normalised, not after: a processor that cannot coerce
  // says so on console.error, and the worker's stdio goes nowhere.
  const restoreConsole = request.captureLogs ? captureConsole() : undefined;
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
    reactor,
    executionType: request.executionType,
    identity: request.identity,
  });
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
  const { piece } = await loadCached(request);
  const trigger = getTriggers(piece)[request.triggerName] as
    | ReturnType<typeof getTriggers>[string]
    | undefined;
  if (!trigger) {
    throw new Error(
      `No trigger "${request.triggerName}" in bundle ${request.bundleDir}`,
    );
  }
  // The durable store answers every get/put over the call channel, so a long
  // onEnable checkpoints: registration ids survive a crash mid-hook.
  const snapshot = request.durableStore
    ? undefined
    : new InMemoryKeyValueStore(request.storeState);
  const runsPiece = request.hook === "run" || request.hook === "test";
  const handle = buildTriggerContext({
    propsValue: await normalizePropsValue(trigger.props, request.propsValue),
    auth: request.auth,
    store: snapshot ?? new RemoteKeyValueStore(),
    hostPartitionedStore: request.durableStore,
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
    // Only the snapshot path has state to hand back; a durable store already
    // committed everything the hook wrote.
    ...(snapshot
      ? { storeState: jsonSafe(snapshot.snapshot()) as Record<string, unknown> }
      : {}),
    schedules: handle.schedules,
    listeners: handle.listeners,
  };
}

// What auth.validate is handed upstream: the property values themselves, not
// the connection envelope an action receives.
function authForValidate(auth: unknown): unknown {
  if (auth === null || typeof auth !== "object") return auth;
  const value = auth as Record<string, unknown>;
  switch (value.type) {
    case "CUSTOM_AUTH":
      return value.props;
    case "SECRET_TEXT":
      return value.secret_text;
    case "BASIC_AUTH":
      return { username: value.username, password: value.password };
    default:
      return auth;
  }
}

// `{ valid: true }` or `{ valid: false, error }`, mapped onto the convention
// app.checkConnection uses so the host reads one shape.
function fromValidateResult(result: unknown): CheckConnectionOutcome {
  if (result === null || typeof result !== "object") {
    return { declared: true, result: jsonSafe(result) };
  }
  const value = result as { valid?: unknown; error?: unknown };
  if (value.valid === false) {
    return {
      declared: true,
      result: false,
      ...(typeof value.error === "string" && value.error
        ? { detail: value.error }
        : {}),
    };
  }
  return { declared: true, result: jsonSafe(result) };
}

async function handleCheckConnection(
  message: CheckConnectionMessage,
): Promise<WorkerResponse> {
  const { request } = message;
  const { piece } = await loadCached(request);
  const app = piece as {
    checkConnection?: (context: unknown) => unknown;
    auth?: { validate?: (context: unknown) => unknown };
  };
  const validate = app.auth?.validate;
  // Powerhouse's own hook first: it can name the account, which validate's
  // boolean cannot. Falling back to validate is what gives every Activepieces
  // piece a check, since none of them declares checkConnection.
  const declared =
    typeof app.checkConnection === "function" || typeof validate === "function";
  if (!declared) {
    const outcome: CheckConnectionOutcome = { declared: false };
    return {
      id: message.id,
      type: "result",
      output: outcome,
      touched: [],
      tlsPoisoned: consumeTlsFlag(),
    };
  }
  const usingCheck = typeof app.checkConnection === "function";
  const { context, touched } = buildCheckConnectionContext({
    auth: usingCheck ? request.auth : authForValidate(request.auth),
  });
  const outcome: CheckConnectionOutcome = usingCheck
    ? {
        declared: true,
        result: jsonSafe(await app.checkConnection!(context)),
      }
    : fromValidateResult(await validate!(context));
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
  const { piece } = await loadCached(request);
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
  // Deferred so a synchronous throw — a malformed egress policy — becomes a
  // rejection the handler below reports, instead of killing the child.
  const handler = Promise.resolve().then(() => {
    setMaxFileBytes(message.request.maxFileBytes);
    return runWithEgressPolicy(message.request.egress, () => dispatch(message));
  });
  handler
    .catch(
      (error: unknown): WorkerResponse => ({
        id: message.id,
        type: "error",
        error: serializeError(error, redactValuesOf(message)),
        tlsPoisoned: consumeTlsFlag(),
      }),
    )
    .then((response) => process.send?.(response))
    .catch(() => process.exit(1));
});
