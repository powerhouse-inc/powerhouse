import type { ModelManifestEntry } from "../executor/worker/protocol.js";
import { DuplicateModuleError, ModuleNotFoundError } from "./errors.js";
import type {
  IDocumentModelLoader,
  IDocumentModelRegistry,
} from "./interfaces.js";

export interface IDocumentModelResolver {
  ensureModelLoaded(documentType: string): Promise<void>;
}

/**
 * Post-success hook called after the resolver registers a newly loaded
 * model on the parent's registry. Used to broadcast `load-model` to the
 * worker pool so workers can register the same model locally.
 */
export type ModelLoadedBroadcastHook = (
  entry: ModelManifestEntry,
) => Promise<void>;

/**
 * Encapsulates the logic for resolving document model modules on demand.
 * Shared between the queue (CREATE_DOCUMENT gate) and the executor manager
 * (post-failure recovery) so that both paths use the same deduplication
 * and failure-caching state.
 */
export class DocumentModelResolver implements IDocumentModelResolver {
  private loadingModels = new Map<string, Promise<void>>();
  private failedModelTypes = new Set<string>();
  private broadcastHook: ModelLoadedBroadcastHook | null = null;

  constructor(
    private registry: IDocumentModelRegistry,
    private loader: IDocumentModelLoader,
  ) {}

  /**
   * Install a post-success hook called after the resolver registers a
   * newly loaded model. ReactorBuilder uses this to wire the worker-pool
   * `load-model` broadcast without touching the resolver's constructor.
   */
  setBroadcastHook(hook: ModelLoadedBroadcastHook): void {
    this.broadcastHook = hook;
  }

  async ensureModelLoaded(documentType: string): Promise<void> {
    try {
      this.registry.getModule(documentType);
      return;
    } catch (error) {
      if (!ModuleNotFoundError.isError(error)) {
        throw error;
      }
    }

    if (this.failedModelTypes.has(documentType)) {
      throw new Error(
        `Document model type previously failed to load: ${documentType}`,
      );
    }

    const existing = this.loadingModels.get(documentType);
    if (existing) {
      return existing;
    }

    const loadPromise = (async () => {
      try {
        const module = await this.loader.load(documentType);
        const [result] = this.registry.registerModules(module);
        if (
          result.status === "error" &&
          !DuplicateModuleError.isError(result.error)
        ) {
          throw result.error as Error;
        }
        await this.broadcastIfPossible(documentType);
      } catch (error) {
        this.failedModelTypes.add(documentType);
        throw error;
      } finally {
        this.loadingModels.delete(documentType);
      }
    })();

    this.loadingModels.set(documentType, loadPromise);
    return loadPromise;
  }

  private async broadcastIfPossible(documentType: string): Promise<void> {
    if (!this.broadcastHook || !this.loader.resolveSpec) {
      return;
    }
    const entry = await this.loader.resolveSpec(documentType);
    if (!entry) {
      return;
    }
    await this.broadcastHook(entry);
  }
}

/**
 * No-op resolver used when no document model loader is configured.
 * Checks the registry for the model and returns if found; throws if not.
 * Since there is no loader, missing models cannot be recovered.
 */
export class NullDocumentModelResolver implements IDocumentModelResolver {
  constructor(private registry?: IDocumentModelRegistry) {}

  ensureModelLoaded(documentType: string): Promise<void> {
    if (this.registry) {
      try {
        this.registry.getModule(documentType);
        return Promise.resolve();
      } catch {
        // fall through to throw below
      }
    }

    return Promise.reject(new ModuleNotFoundError(documentType));
  }
}
