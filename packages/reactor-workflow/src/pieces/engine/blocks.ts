import { ensurePieceBundle } from "../activepieces/fetch.js";
import { PieceWorker } from "../activepieces/worker/host.js";
import type { EngineConnectionResolver } from "./connections.js";
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

// core#branch routes on its (already resolved) condition: equal to `equals`
// when that is set, otherwise truthiness.
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
    return Promise.reject(new UnknownBlockTypeError(execution.blockType));
  }
}

export interface ActivepiecesBlockExecutorOptions {
  cacheDir: string;
  // Piece package name -> pinned version; the connector registry for this run.
  // A blockType may instead pin inline: "@scope/pkg@1.2.3#action".
  packages?: Record<string, string>;
  connections?: EngineConnectionResolver;
  worker?: PieceWorker;
  defaultTimeoutMs?: number;
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
  private readonly worker: PieceWorker;
  private readonly ownsWorker: boolean;

  constructor(private readonly options: ActivepiecesBlockExecutorOptions) {
    this.ownsWorker = !options.worker;
    this.worker = options.worker ?? new PieceWorker();
  }

  async execute(execution: BlockExecution): Promise<BlockResult> {
    const parsed = parseBlockType(execution.blockType, this.options.packages);
    if (!parsed) {
      throw new UnknownBlockTypeError(execution.blockType);
    }
    if (parsed.kind !== "action") {
      throw new TriggerBlockAsStepError(execution.blockType);
    }

    const bundle = await ensurePieceBundle({
      name: parsed.packageName,
      version: parsed.version,
      cacheDir: this.options.cacheDir,
    });
    const auth = execution.connectionId
      ? await this.options.connections?.resolve(execution.connectionId)
      : undefined;

    const timeoutMs = execution.step.timeoutSeconds
      ? execution.step.timeoutSeconds * 1000
      : this.options.defaultTimeoutMs;
    const result = await this.worker.runAction(
      {
        bundleDir: bundle.dir,
        actionName: parsed.name,
        propsValue: execution.config as Record<string, unknown>,
        auth,
      },
      timeoutMs ? { timeoutMs } : {},
    );
    return { output: result.output };
  }

  dispose(): void {
    if (this.ownsWorker) this.worker.dispose();
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
