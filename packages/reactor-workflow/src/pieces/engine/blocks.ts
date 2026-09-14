import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { ensurePieceBundle } from "../activepieces/fetch.js";
import { rewriteFileRefs, type StagedFile } from "../activepieces/context/files.js";
import {
  PieceWorker,
  type IPieceWorker,
} from "../activepieces/worker/host.js";
import { DEFAULT_EGRESS_POLICY } from "../activepieces/worker/egress.js";
import {
  LOG_WRITE,
  OUTPUT_UPDATE,
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
  packages?: Record<string, string>;
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

  constructor(private readonly options: ActivepiecesBlockExecutorOptions) {}

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

  async execute(execution: BlockExecution): Promise<BlockResult> {
    const parsed = parseBlockType(execution.blockType, this.options.packages);
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
      const bundle = await ensurePieceBundle({
        name: parsed.packageName,
        version: parsed.version,
        cacheDir: this.options.cacheDir,
      });
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
      const result = await this.worker().runAction(
        {
          bundleDir: bundle.dir,
          actionName: parsed.name,
          propsValue: execution.config as Record<string, unknown>,
          auth,
          ...(redactValues.length > 0 ? { redactValues } : {}),
          ...(stagingDir ? { stagingDir } : {}),
          ...(stagedInputs ? { stagedInputs } : {}),
          ...(pieceStore ? { durableStore: true } : {}),
          ...(this.options.onPieceLog ? { captureLogs: true } : {}),
          ...(this.options.onPartialOutput ? { liveOutput: true } : {}),
          ...(egress ? { egress } : {}),
        },
        {
          ...(timeoutMs ? { timeoutMs } : {}),
          ...(pieceStore ? { hostCalls: storeHandlers(pieceStore) } : {}),
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
// Handlers let the host add blocks needing host services (e.g. core#document-*).
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
