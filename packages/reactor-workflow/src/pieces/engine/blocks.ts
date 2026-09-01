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

// core#branch routes on the truthiness of its (already resolved) condition.
export class CoreBlockExecutor implements BlockExecutor {
  static handles(blockType: string): boolean {
    return blockType.startsWith("core#");
  }

  execute(execution: BlockExecution): Promise<BlockResult> {
    if (execution.blockType === "core#branch") {
      const { condition } = execution.config as { condition?: unknown };
      const taken =
        Boolean(condition) && condition !== "false" && condition !== "0";
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

// "<pkg>[@<version>]#<action>" — the version after the scope-less "@" wins
// over the registry.
export function parseBlockType(
  blockType: string,
  packages: Record<string, string> = {},
): { packageName: string; version: string; actionName: string } | undefined {
  const separator = blockType.lastIndexOf("#");
  if (separator <= 0) return undefined;
  const packageSpec = blockType.slice(0, separator);
  const actionName = blockType.slice(separator + 1);
  const versionAt = packageSpec.indexOf("@", 1);
  if (versionAt > 0) {
    return {
      packageName: packageSpec.slice(0, versionAt),
      version: packageSpec.slice(versionAt + 1),
      actionName,
    };
  }
  const version = packages[packageSpec] as string | undefined;
  if (!version) return undefined;
  return { packageName: packageSpec, version, actionName };
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
        actionName: parsed.actionName,
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
