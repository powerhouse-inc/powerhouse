import {
  blockKey,
  isExactVersion,
  type BlockKind,
  type BlockRef,
} from "@powerhousedao/pieces-framework/block-type";
import { childLogger } from "document-model";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  bundleResolver,
  pieceModuleRef,
  type PieceResolver,
} from "../activepieces/resolver.js";
import type { ActionContextIdentity } from "../activepieces/context/action.js";
import { hostCallTimeoutForStep } from "../activepieces/context/limits.js";
import {
  rewriteFileRefs,
  type StagedFile,
} from "../activepieces/context/files.js";
import { PieceWorker, type IPieceWorker } from "../activepieces/worker/host.js";
import type { ReactorTap } from "../activepieces/worker/reactor-rpc.js";
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
import { builtinPiece, isBuiltinPiece, runBuiltinAction } from "../builtin.js";
import {
  blockLabel,
  missingError,
  UnknownBlockError,
  unpinnedNote,
  withResolution,
  type BlockResolution,
  type PieceOrigin,
} from "./resolution.js";

export { UnknownBlockError };

export class TriggerBlockAsStepError extends Error {
  constructor(block: BlockRef) {
    super(
      `${blockLabel(block)} is a trigger and cannot run as a workflow step`,
    );
    this.name = "TriggerBlockAsStepError";
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

const logger = childLogger(["workflow", "piece-staging"]);

export interface ActivepiecesBlockExecutorOptions {
  cacheDir: string;
  // Which piece version, from which source, runs a block. Without one a
  // block runs its pin, fetched from any download source.
  resolveBlock?: (block: BlockRef) => Promise<BlockResolution>;
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
  // Where a block's piece comes from. Defaults to fetching the pinned
  // version into `cacheDir`, which is what a published piece needs.
  resolver?: PieceResolver;
  // ctx.reactor over the reactor RPC, for an action that declares requireReactor;
  // undefined when it declares none. Asked per step.
  reactorAccess?: (
    request: StepReactorRequest,
  ) => Promise<ReactorTap | undefined>;
  // Where a step's piece may connect to. Left unset it is the default policy,
  // which refuses private address space; `null` runs the piece unrestricted.
  egress?: EgressPolicy | null;
  // Taps on a running step. Each is opt-in because it costs the worker an IPC
  // message per event, and neither is asked for unless someone reads it.
  onPieceLog?: (entry: PieceLogEntry, execution: BlockExecution) => void;
  onPartialOutput?: (output: unknown, execution: BlockExecution) => void;
  // The run, workflow and project a step belongs to, asked per step: the
  // executor is shared across runs. The step name is the step's key.
  identity?: () => Omit<ActionContextIdentity, "stepName"> | undefined;
  // Whether this step runs as a single-step test, asked per step likewise.
  stepTest?: () => boolean;
}

export interface StepReactorRequest {
  block: ParsedBlockType;
  reactorConnectionId?: string | null;
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

// Shipped by the workflow package, which versions it with the host.
const HOST_SHIPPED_PIECE = "@powerhousedao/piece-reactor";

// The host's own code, so it always runs the installed copy.
export function isHostBound(packageName: string): boolean {
  return packageName === HOST_SHIPPED_PIECE || isBuiltinPiece(packageName);
}

export type { BlockKind };

// A block's piece with the version and source it runs at.
export interface ParsedBlockType {
  packageName: string;
  version: string;
  source?: PieceOrigin;
  kind: BlockKind;
  // Action or trigger name within the piece.
  name: string;
}

// The piece a resolution runs; undefined for a missing one.
export function resolvedBlock(
  resolution: BlockResolution,
): ParsedBlockType | undefined {
  const { requested, resolved } = resolution;
  if (!resolved || resolution.match === "missing") return undefined;
  return {
    packageName: requested.pieceName,
    version: resolved.version,
    ...(resolved.source ? { source: resolved.source } : {}),
    kind: requested.kind,
    name: requested.name,
  };
}

// Without a host policy a block runs exactly what it pins.
export function pinnedResolution(block: BlockRef): BlockResolution {
  if (!isExactVersion(block.pieceVersion)) {
    return { requested: block, match: "missing", note: unpinnedNote(block) };
  }
  return {
    requested: block,
    resolved: { version: block.pieceVersion },
    match: "exact",
  };
}

// Executes piece actions: a built-in piece in process, any other through the
// piece worker.
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

  async execute(execution: BlockExecution): Promise<BlockResult> {
    const resolution = this.options.resolveBlock
      ? await this.options.resolveBlock(execution.block)
      : pinnedResolution(execution.block);
    const parsed = resolvedBlock(resolution);
    if (!parsed) throw missingError(resolution);
    if (parsed.kind !== "action") {
      throw new TriggerBlockAsStepError(execution.block);
    }
    try {
      const builtin = builtinPiece(parsed.packageName);
      const result = builtin
        ? await runBuiltinAction(
            builtin,
            parsed.name,
            execution.config as Record<string, unknown>,
          )
        : await this.run(execution, parsed);
      return { ...result, resolution };
    } catch (error) {
      throw withResolution(error, resolution);
    }
  }

  private async run(
    execution: BlockExecution,
    parsed: ParsedBlockType,
  ): Promise<BlockResult> {
    // One staging directory per execution, removed in the finally below. A
    // host crash can still leave one behind, which is why it lives under a
    // root the host can sweep at startup.
    const stagingDir = this.options.stagingRoot
      ? path.join(this.options.stagingRoot, randomUUID())
      : undefined;

    // Bundle fetch and connection resolution belong inside the catch: a secret
    // provider or a resolver can fail with the credential in its own message.
    const runSecrets = execution.redactValues ?? [];
    let redactValues: string[] = [...runSecrets];
    try {
      const piece = await this.resolver.resolve({
        name: parsed.packageName,
        version: parsed.version,
        ...(parsed.source ? { source: parsed.source } : {}),
      });
      const connection = await this.resolveConnection(execution.connectionId, {
        piecePackage: parsed.packageName,
        stepId: execution.step.id,
        stepKey: execution.step.key,
      });
      const auth = connection?.auth;
      redactValues = [...runSecrets, ...(connection?.secretValues ?? [])];

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
      const reactorTap = await this.options.reactorAccess?.({
        block: parsed,
        reactorConnectionId: execution.reactorConnectionId,
      });
      const result = await this.worker().runAction(
        {
          ...pieceModuleRef(piece),
          actionName: parsed.name,
          propsValue: execution.config as Record<string, unknown>,
          auth,
          identity: {
            ...this.options.identity?.(),
            stepName: execution.step.key,
          },
          ...(redactValues.length > 0 ? { redactValues } : {}),
          ...(this.options.stepTest?.() ? { stepTest: true } : {}),
          ...(stagingDir ? { stagingDir } : {}),
          ...(stagedInputs ? { stagedInputs } : {}),
          ...(pieceStore ? { durableStore: true } : {}),
          ...(this.options.onPieceLog ? { captureLogs: true } : {}),
          ...(this.options.onPartialOutput ? { liveOutput: true } : {}),
          ...(egress ? { egress } : {}),
        },
        {
          ...(timeoutMs ? { timeoutMs } : {}),
          // Never shorter than the step's own timeout: a step given two
          // minutes must not have its host calls cut off after ten seconds.
          hostCallTimeoutMs: hostCallTimeoutForStep(timeoutMs),
          ...(pieceStore ? { hostCalls: storeHandlers(pieceStore) } : {}),
          ...(notifications ? { notifications } : {}),
          ...(reactorTap ? { reactor: reactorTap } : {}),
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
      try {
        const meta = await port.read(ref, destPath);
        staged.push({ ref, path: destPath, ...meta });
      } catch (error) {
        // Staging is opportunistic: refs are collected from the whole config
        // without knowing which props are FILE, because the prop schema lives
        // in the worker. So a ref this step was never going to open must not
        // fail it -- a dispatch carrying one as data is the ordinary case. A
        // FILE prop that did need it still fails, in the worker, naming the
        // reference it could not resolve.
        logger.debug(
          "Left @ref unstaged: @error",
          ref,
          error instanceof Error ? error.message : String(error),
        );
      }
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

// Routes explicit handlers first, then the piece executor. Handlers, keyed
// by blockKey, let a host serve blocks of its own in its process.
export class CompositeBlockExecutor implements BlockExecutor {
  constructor(
    private readonly pieces: BlockExecutor,
    private readonly handlers: Record<string, BlockExecutor> = {},
  ) {}

  execute(execution: BlockExecution): Promise<BlockResult> {
    const handler = this.handlers[blockKey(execution.block)] as
      | BlockExecutor
      | undefined;
    if (handler) return handler.execute(execution);
    return this.pieces.execute(execution);
  }
}
