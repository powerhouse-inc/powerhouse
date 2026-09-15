import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  bundleResolver,
  pieceModuleRef,
  type PieceResolver,
} from "../activepieces/resolver.js";
import type { ReactorService } from "../activepieces/context/reactor.js";
import { rewriteFileRefs, type StagedFile } from "../activepieces/context/files.js";
import {
  PieceWorker,
  type IPieceWorker,
} from "../activepieces/worker/host.js";
import { DEFAULT_EGRESS_POLICY } from "../activepieces/worker/egress.js";
import {
  LOG_WRITE,
  OUTPUT_UPDATE,
  REACTOR_CREATE,
  REACTOR_EXECUTE,
  REACTOR_FIND,
  REACTOR_GET,
  REACTOR_MODEL,
  REACTOR_MODELS,
  STORE_DELETE,
  STORE_GET,
  STORE_PUT,
  type EgressPolicy,
  type HostCallHandlers,
  type HostNotifyHandlers,
  type PieceLogEntry,
  type StagedInput,
} from "../activepieces/worker/protocol.js";
import type { StoreScopeName } from "../activepieces/context/store-scope.js";
import {
  collectSecretValues,
  redactError,
  redactMessage,
  rememberSecrets,
} from "../activepieces/worker/redact.js";
import type {
  ConnectionRequest,
  EngineConnectionResolver,
  ResolvedConnection,
} from "./connections.js";
import type { BlockExecution, BlockExecutor, BlockResult } from "./types.js";

export class UnknownBlockTypeError extends Error {
  constructor(blockType: string) {
    super(`No executor registered for block type "${blockType}"`);
    this.name = "UnknownBlockTypeError";
  }
}

export class TriggerBlockAsStepError extends Error {
  constructor(blockType: string) {
    super(`Trigger block type "${blockType}" cannot run as a workflow step`);
    this.name = "TriggerBlockAsStepError";
  }
}

// Core blocks. core#branch routes on its (already resolved) condition: equal
// to `equals` when that is set, otherwise truthiness. core#assert fails the
// run on blank or rejected values.
export class CoreBlockExecutor implements BlockExecutor {
  static handles(blockType: string): boolean {
    return blockType.startsWith("core#");
  }

  execute(execution: BlockExecution): Promise<BlockResult> {
    if (execution.blockType === "core#branch") {
      const { condition, equals } = execution.config as {
        condition?: unknown;
        equals?: unknown;
      };
      // Trimmed and case-insensitive: the condition is often model output.
      const normalize = (value: unknown) =>
        (typeof value === "string"
          ? value
          : value === undefined || value === null
            ? ""
            : JSON.stringify(value)
        )
          .trim()
          .toLowerCase();
      const taken =
        typeof equals === "string"
          ? normalize(condition) === normalize(equals)
          : Boolean(condition) && condition !== "false" && condition !== "0";
      return Promise.resolve({
        output: { condition: condition ?? null },
        port: taken ? "true" : "false",
      });
    }
    if (execution.blockType === "core#assert") {
      return this.assert(execution);
    }
    return Promise.reject(new UnknownBlockTypeError(execution.blockType));
  }

  // core#assert fails the step when its value is blank or is one of the
  // rejected values. Model output is the motivating case: an empty
  // completion, or a classifier answering the wrong question, must not flow
  // on to a step with a side effect.
  private assert(execution: BlockExecution): Promise<BlockResult> {
    const { value, rejectValues, allowValues, allowEmpty, message } =
      execution.config as {
        value?: unknown;
        rejectValues?: unknown;
        allowValues?: unknown;
        allowEmpty?: unknown;
        message?: unknown;
      };
    const text =
      typeof value === "string"
        ? value
        : value === undefined || value === null
          ? ""
          : JSON.stringify(value);
    const trimmed = text.trim();
    const fail = (reason: string) =>
      Promise.reject(
        new Error(
          typeof message === "string" && message
            ? message
            : `core#assert: ${reason}`,
        ),
      );

    if (!trimmed && allowEmpty !== true) {
      return fail("value is empty");
    }
    const normalizeList = (entries: unknown) =>
      (typeof entries === "string"
        ? [entries]
        : Array.isArray(entries)
          ? entries
          : []
      )
        .map((entry) => String(entry).trim().toLowerCase())
        .filter(Boolean);

    if (normalizeList(rejectValues).includes(trimmed.toLowerCase())) {
      return fail(`value is a rejected value ("${trimmed}")`);
    }
    // An allow-list is the safer gate for model output: anything unforeseen
    // fails here rather than reaching a step that writes.
    const allowed = normalizeList(allowValues);
    if (allowed.length > 0 && !allowed.includes(trimmed.toLowerCase())) {
      return fail(
        `value "${trimmed}" is not one of the allowed values (${allowed.join(", ")})`,
      );
    }
    return Promise.resolve({ output: { value }, port: "next" });
  }
}

// The host's attachment store, as the engine needs it: materialize a
// reference to a path the worker can read, and ingest a path the worker wrote.
// Both directions go through the filesystem, so bytes never enter IPC.
export interface AttachmentPort {
  read(
    ref: string,
    destPath: string,
  ): Promise<{ fileName?: string; contentType?: string }>;
  write(file: {
    path: string;
    fileName: string;
    size: number;
    contentType?: string;
  }): Promise<string>;
}

const ATTACHMENT_REF = /^attachment:\/\//i;

// Collects every attachment reference appearing as a string in a step config.
// Deliberately type-agnostic: the worker decides which of them to hydrate
// (only FILE props go through toApFile), so staging a reference no one reads
// costs one file, while missing one would fail the step.
function collectRefs(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    if (ATTACHMENT_REF.test(value)) found.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectRefs(entry, found);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const entry of Object.values(value)) collectRefs(entry, found);
  }
}

// The durable `ctx.store`, as the engine needs it: one call per operation, so
// a piece that checkpoints mid-loop keeps what it wrote if the step then dies.

// Which scope a step's keys belong to is the host's business; the executor is
// shared across runs and must not decide it.
export interface PieceStorePort {
  get(key: string, scope: StoreScopeName): Promise<unknown>;
  put(key: string, value: unknown, scope: StoreScopeName): Promise<void>;
  delete(key: string, scope: StoreScopeName): Promise<void>;
}

// One key operation as it arrives from the worker.
interface StoreCallPayload {
  key?: unknown;
  value?: unknown;
  scope?: unknown;
}

// An unrecognised scope is treated as FLOW, the narrower partition: a bad
// name must never widen what a step can reach.
function storeScopeOf(payload: unknown): StoreScopeName {
  const scope = (payload as StoreCallPayload | undefined)?.scope;
  return scope === "PROJECT" ? "PROJECT" : "FLOW";
}

function storeKeyOf(payload: unknown): string {
  const key = (payload as StoreCallPayload | undefined)?.key;
  if (typeof key !== "string" || key === "") {
    throw new Error("Store call carried no key");
  }
  return key;
}

// The host's half of `ctx.reactor`: the same operations the piece calls, run
// against the reactor this host serves. See activepieces/context/reactor.ts.

// Registered per step and only for a piece the host resolved locally, so a
// fetched bundle forging these calls finds no handler and is refused.
export type ReactorPort = ReactorService;

// Payloads arrive from the child, which runs piece code: a call is checked
// here rather than trusted to have come from our own proxy.
function reactorInput(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Reactor call carried no input object");
  }
  return payload as Record<string, unknown>;
}

function requiredString(
  payload: Record<string, unknown>,
  field: string,
): string {
  const value = payload[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`Reactor call carried no "${field}"`);
  }
  return value;
}

function optionalString(
  payload: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = payload[field];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function reactorActions(payload: Record<string, unknown>) {
  const actions = payload.actions;
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error("Reactor call carried no actions");
  }
  return actions.map((entry, index) => {
    const action = entry as Record<string, unknown> | null;
    if (!action || typeof action.type !== "string") {
      throw new Error(`Reactor call: actions[${index}] needs a string "type"`);
    }
    return {
      type: action.type,
      input: action.input,
      ...(typeof action.scope === "string" ? { scope: action.scope } : {}),
    };
  });
}

// A page size the host will serve. The value arrives from piece code, so it
// is clamped here rather than trusted; a host may cap it further.
const MAX_FIND_LIMIT = 100;

function findLimit(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.floor(value), 1), MAX_FIND_LIMIT);
}

// The state match, as the host will accept it. Both halves must be strings and
// the path must name something: a match with an empty path would silently pass
// every document, which is the opposite of what a step asking to match wants.
function findMatch(value: unknown): { path: string; value: string } | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const path = record.path;
  const wanted = record.value;
  if (typeof path !== "string" || path.trim() === "") return undefined;
  if (typeof wanted !== "string") return undefined;
  return { path: path.trim(), value: wanted };
}

export function reactorHandlers(port: ReactorPort): HostCallHandlers {
  return {
    [REACTOR_MODELS]: () => port.models(),
    [REACTOR_MODEL]: (payload) =>
      port.model(requiredString(reactorInput(payload), "documentType")),
    [REACTOR_GET]: (payload) => {
      const input = reactorInput(payload);
      return port.get({
        documentId: requiredString(input, "documentId"),
        ...(optionalString(input, "branch")
          ? { branch: optionalString(input, "branch") }
          : {}),
      });
    },
    [REACTOR_FIND]: (payload) => {
      const input = reactorInput(payload);
      return port.find({
        ...(optionalString(input, "documentType")
          ? { documentType: optionalString(input, "documentType") }
          : {}),
        ...(optionalString(input, "parentId")
          ? { parentId: optionalString(input, "parentId") }
          : {}),
        ...(findLimit(input.limit) !== undefined
          ? { limit: findLimit(input.limit) }
          : {}),
        ...(findMatch(input.match) ? { match: findMatch(input.match) } : {}),
        ...(input.withState === true ? { withState: true } : {}),
      });
    },
    [REACTOR_CREATE]: (payload) => {
      const input = reactorInput(payload);
      return port.create({
        documentType: requiredString(input, "documentType"),
        ...(optionalString(input, "name")
          ? { name: optionalString(input, "name") }
          : {}),
        ...(optionalString(input, "parentId")
          ? { parentId: optionalString(input, "parentId") }
          : {}),
      });
    },
    [REACTOR_EXECUTE]: (payload) => {
      const input = reactorInput(payload);
      return port.execute({
        documentId: requiredString(input, "documentId"),
        ...(optionalString(input, "branch")
          ? { branch: optionalString(input, "branch") }
          : {}),
        actions: reactorActions(input),
      });
    },
  };
}

// The handlers served to a running step or trigger hook. A rejection becomes
// the error the piece sees, which is what an over-limit write should do.
export function storeHandlers(port: PieceStorePort): HostCallHandlers {
  return {
    [STORE_GET]: (payload) =>
      port.get(storeKeyOf(payload), storeScopeOf(payload)),
    [STORE_PUT]: async (payload) => {
      await port.put(
        storeKeyOf(payload),
        (payload as StoreCallPayload).value,
        storeScopeOf(payload),
      );
      return null;
    },
    [STORE_DELETE]: async (payload) => {
      await port.delete(storeKeyOf(payload), storeScopeOf(payload));
      return null;
    },
  };
}

export interface ActivepiecesBlockExecutorOptions {
  cacheDir: string;
  // Piece package name -> pinned version; the connector registry for this run.
  // A blockType may instead pin inline: "@scope/pkg@1.2.3#action".

  // A function is awaited per step, so a host whose registry loads lazily —
  // package pieces are pinned by what is installed, not by the block type —
  // answers with what it has by the time a step actually runs.
  packages?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  connections?: EngineConnectionResolver;
  // The worker piece steps go to. A function is asked once per step, so a
  // host handing each run its own child answers with that run's.
  worker?: IPieceWorker | (() => IPieceWorker | undefined);
  defaultTimeoutMs?: number;
  // Both are needed for ctx.files to work: a directory the host and the forked
  // worker share, and somewhere to put what the piece wrote. Without them a
  // piece calling ctx.files falls back to inline data URIs.
  stagingRoot?: string;
  attachments?: AttachmentPort;
  // Without it `ctx.store` falls back to the worker's heap, which a step
  // timeout discards.
  pieceStore?: PieceStorePort;
  // Where a block type's piece comes from. Defaults to fetching the pinned
  // version into `cacheDir`, which is what a published piece needs.
  resolver?: PieceResolver;
  // Serves `ctx.reactor`, and only to a piece the resolver answered locally.
  // Without it even a package piece finds the member throwing.
  reactor?: ReactorPort;
  // Where a step's piece may connect to. Left unset it is the default policy,
  // which refuses private address space; `null` runs the piece unrestricted.
  egress?: EgressPolicy | null;
  // Taps on a running step. Each is opt-in because it costs the worker an IPC
  // message per event, and neither is asked for unless someone reads it.
  onPieceLog?: (entry: PieceLogEntry, execution: BlockExecution) => void;
  onPartialOutput?: (output: unknown, execution: BlockExecution) => void;
}

// The notify handlers served to one step. Unlike a store call, nothing here
// answers the piece: these are reports, and the step never waits on them.
function stepTaps(
  options: ActivepiecesBlockExecutorOptions,
  execution: BlockExecution,
  values: string[],
): HostNotifyHandlers | undefined {
  const { onPieceLog, onPartialOutput } = options;
  if (!onPieceLog && !onPartialOutput) return undefined;
  const handlers: HostNotifyHandlers = {};
  if (onPieceLog) {
    // A piece logging its own outgoing request is a common idiom, so this is
    // one of the likeliest places for a credential to reach the host log.
    handlers[LOG_WRITE] = (payload) => {
      const entry = payload as PieceLogEntry;
      // Returned, not discarded: a sink that rejects is the host's to catch.
      return onPieceLog(
        { ...entry, message: redactMessage(entry.message, { values }) },
        execution,
      );
    };
  }
  if (onPartialOutput) {
    handlers[OUTPUT_UPDATE] = (payload) => onPartialOutput(payload, execution);
  }
  return handlers;
}

// Mutated in place rather than rewrapped: callers classify on the error's
// class, and a new one would lose that.

// `stack` embeds the message as it was at construction, so a caller logging
// the error object rather than `.message` would otherwise still print it.
function redactThrown(error: unknown, values: string[]): unknown {
  if (error instanceof Error) {
    error.message = redactMessage(error.message, { values });
    if (error.stack) error.stack = redactMessage(error.stack, { values });
    return rememberSecrets(error, values);
  }
  return rememberSecrets(redactError(error, { values }), values);
}

export type BlockKind = "action" | "trigger";

export interface ParsedBlockType {
  packageName: string;
  version: string;
  kind: BlockKind;
  // Action or trigger name within the piece.
  name: string;
}

const TRIGGER_FRAGMENT = "trigger:";

// "<pkg>[@<version>]#<action>" or "<pkg>[@<version>]#trigger:<trigger>" —
// the version after the scope-less "@" wins over the registry.
export function parseBlockType(
  blockType: string,
  packages: Record<string, string> = {},
): ParsedBlockType | undefined {
  const separator = blockType.lastIndexOf("#");
  if (separator <= 0) return undefined;
  const packageSpec = blockType.slice(0, separator);
  const fragment = blockType.slice(separator + 1);
  const isTrigger = fragment.startsWith(TRIGGER_FRAGMENT);
  const name = isTrigger ? fragment.slice(TRIGGER_FRAGMENT.length) : fragment;
  if (!name) return undefined;
  const kind: BlockKind = isTrigger ? "trigger" : "action";
  const versionAt = packageSpec.indexOf("@", 1);
  if (versionAt > 0) {
    return {
      packageName: packageSpec.slice(0, versionAt),
      version: packageSpec.slice(versionAt + 1),
      kind,
      name,
    };
  }
  const version = packages[packageSpec] as string | undefined;
  if (!version) return undefined;
  return { packageName: packageSpec, version, kind, name };
}

// Executes "<packageName>#<actionName>" block types through the piece worker.
export class ActivepiecesBlockExecutor implements BlockExecutor {
  // Only set when nothing was supplied: the fallback this executor owns and
  // must dispose. A supplied worker belongs to whoever supplied it.
  private own: PieceWorker | undefined;

  private readonly resolver: PieceResolver;

  constructor(private readonly options: ActivepiecesBlockExecutorOptions) {
    this.resolver =
      options.resolver ?? bundleResolver({ cacheDir: options.cacheDir });
  }

  private worker(): IPieceWorker {
    const supplied = this.options.worker;
    if (typeof supplied === "function") {
      const worker = supplied();
      if (worker) return worker;
    } else if (supplied) {
      return supplied;
    }
    return (this.own ??= new PieceWorker());
  }

  private packages(): Promise<Record<string, string>> {
    const supplied = this.options.packages;
    return Promise.resolve(
      typeof supplied === "function" ? supplied() : (supplied ?? {}),
    );
  }

  async execute(execution: BlockExecution): Promise<BlockResult> {
    const parsed = parseBlockType(execution.blockType, await this.packages());
    if (!parsed) {
      throw new UnknownBlockTypeError(execution.blockType);
    }
    if (parsed.kind !== "action") {
      throw new TriggerBlockAsStepError(execution.blockType);
    }

    // One staging directory per execution, removed in the finally below. A
    // host crash can still leave one behind, which is why it lives under a
    // root the host can sweep at startup.
    const stagingDir = this.options.stagingRoot
      ? path.join(this.options.stagingRoot, randomUUID())
      : undefined;

    // Bundle fetch and connection resolution belong inside the catch: a secret
    // provider or a resolver can fail with the credential in its own message.
    let redactValues: string[] = [];
    try {
      const piece = await this.resolver.resolve(
        parsed.packageName,
        parsed.version,
      );
      const connection = await this.resolveConnection(execution.connectionId, {
        blockType: execution.blockType,
        piecePackage: parsed.packageName,
        stepId: execution.step.id,
        stepKey: execution.step.key,
      });
      const auth = connection?.auth;
      redactValues = connection?.secretValues ?? [];

      const timeoutMs = execution.step.timeoutSeconds
        ? execution.step.timeoutSeconds * 1000
        : this.options.defaultTimeoutMs;
      const stagedInputs = await this.stageInputs(execution.config, stagingDir);
      const pieceStore = this.options.pieceStore;
      const notifications = stepTaps(this.options, execution, redactValues);
      const egress =
        this.options.egress === undefined
          ? DEFAULT_EGRESS_POLICY
          : this.options.egress;
      // A fetched bundle never reaches the reactor: the handlers below are the
      // only way in, and they are registered for a local piece alone.
      const reactor = piece.local ? this.options.reactor : undefined;
      const result = await this.worker().runAction(
        {
          ...pieceModuleRef(piece),
          actionName: parsed.name,
          propsValue: execution.config as Record<string, unknown>,
          auth,
          ...(redactValues.length > 0 ? { redactValues } : {}),
          ...(stagingDir ? { stagingDir } : {}),
          ...(stagedInputs ? { stagedInputs } : {}),
          ...(pieceStore ? { durableStore: true } : {}),
          ...(reactor ? { reactorAccess: true } : {}),
          ...(this.options.onPieceLog ? { captureLogs: true } : {}),
          ...(this.options.onPartialOutput ? { liveOutput: true } : {}),
          ...(egress ? { egress } : {}),
        },
        {
          ...(timeoutMs ? { timeoutMs } : {}),
          ...(pieceStore || reactor
            ? {
                hostCalls: {
                  ...(pieceStore ? storeHandlers(pieceStore) : {}),
                  ...(reactor ? reactorHandlers(reactor) : {}),
                },
              }
            : {}),
          ...(notifications ? { notifications } : {}),
        },
      );
      return {
        output: await this.ingestFiles(result.output, result.files),
        redactValues,
      };
    } catch (error) {
      // The child already stripped what it threw; this covers what the host
      // itself raises (bundle fetch, connection resolution, file ingest).
      throw redactThrown(error, redactValues);
    } finally {
      if (stagingDir) await rm(stagingDir, { recursive: true, force: true });
    }
  }

  private async resolveConnection(
    connectionId: string | null | undefined,
    request: ConnectionRequest,
  ): Promise<ResolvedConnection | undefined> {
    const connections = this.options.connections;
    if (!connectionId || !connections) return undefined;
    // The request travels with both, so taking the secret-bearing path never
    // means skipping the check on who is asking.
    if (connections.resolveWithSecrets) {
      return connections.resolveWithSecrets(connectionId, request);
    }
    const auth = await connections.resolve(connectionId, request);
    return { auth, secretValues: [...collectSecretValues(auth)] };
  }

  private async stageInputs(
    config: unknown,
    stagingDir: string | undefined,
  ): Promise<StagedInput[] | undefined> {
    const port = this.options.attachments;
    if (!stagingDir || !port) return undefined;
    const refs = new Set<string>();
    collectRefs(config, refs);
    if (refs.size === 0) return undefined;
    await mkdir(stagingDir, { recursive: true });
    const staged: StagedInput[] = [];
    let index = 0;
    for (const ref of refs) {
      const destPath = path.join(stagingDir, `in-${index++}`);
      const meta = await port.read(ref, destPath);
      staged.push({ ref, path: destPath, ...meta });
    }
    return staged;
  }

  // A provisional apfile:// token only becomes a real reference once the step
  // has returned, so a piece that writes a file and then reads it back by URL
  // within the same run would not work. No action needs that today; the fix is
  // a bidirectional worker channel, which is its own design.
  private async ingestFiles(
    output: unknown,
    files: StagedFile[] | undefined,
  ): Promise<unknown> {
    if (!files || files.length === 0) return output;
    const port = this.options.attachments;
    if (!port) {
      throw new Error(
        `The action wrote ${files.length} file(s) through ctx.files, but no attachment store is configured for this reactor`,
      );
    }
    const refs = new Map<string, string>();
    for (const file of files) {
      refs.set(
        file.token,
        await port.write({
          path: file.path,
          fileName: file.fileName,
          size: file.size,
          contentType: file.contentType,
        }),
      );
    }
    return rewriteFileRefs(output, refs);
  }

  dispose(): void {
    this.own?.dispose();
    this.own = undefined;
  }
}

// Routes explicit handlers first, then core#*, then the piece executor.
// Handlers let a host add block types of its own, served in its process.
export class CompositeBlockExecutor implements BlockExecutor {
  private readonly core = new CoreBlockExecutor();

  constructor(
    private readonly pieces: BlockExecutor,
    private readonly handlers: Record<string, BlockExecutor> = {},
  ) {}

  execute(execution: BlockExecution): Promise<BlockResult> {
    const handler = this.handlers[execution.blockType] as
      | BlockExecutor
      | undefined;
    if (handler) return handler.execute(execution);
    if (CoreBlockExecutor.handles(execution.blockType)) {
      return this.core.execute(execution);
    }
    return this.pieces.execute(execution);
  }
}
