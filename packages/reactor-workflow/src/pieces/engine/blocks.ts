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
  packages: Record<string, string>;
  connections?: EngineConnectionResolver;
  worker?: PieceWorker;
  defaultTimeoutMs?: number;
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
    const separator = execution.blockType.lastIndexOf("#");
    if (separator <= 0) {
      throw new UnknownBlockTypeError(execution.blockType);
    }
    const packageName = execution.blockType.slice(0, separator);
    const actionName = execution.blockType.slice(separator + 1);
    const version = this.options.packages[packageName];
    if (!version) {
      throw new UnknownBlockTypeError(execution.blockType);
    }

    const bundle = await ensurePieceBundle({
      name: packageName,
      version,
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
        actionName,
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

// Routes core#* to the core executor and everything else to the piece executor.
export class CompositeBlockExecutor implements BlockExecutor {
  private readonly core = new CoreBlockExecutor();

  constructor(private readonly pieces: BlockExecutor) {}

  execute(execution: BlockExecution): Promise<BlockResult> {
    if (CoreBlockExecutor.handles(execution.blockType)) {
      return this.core.execute(execution);
    }
    return this.pieces.execute(execution);
  }
}
