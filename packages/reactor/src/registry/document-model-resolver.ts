import { childLogger } from "document-model";
import { resolveModelSources } from "../core/model-sources.js";
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
  private modelLoadedHook: ((documentType: string) => Promise<void>) | null =
    null;
  private readonly logger = childLogger(["reactor", "document-model-resolver"]);

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

  /**
   * Post-success hook called with the document type after a model loads, so
   * peers (tabs) can load the same type via the event bus.
   */
  setModelLoadedHook(hook: (documentType: string) => Promise<void>): void {
    this.modelLoadedHook = hook;
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
        await this.loadRegisterAndBroadcast(documentType);
      } catch (error) {
        this.failedModelTypes.add(documentType);
        throw error;
      } finally {
        this.loadingModels.delete(documentType);
      }
      await this.notifyPeersModelLoaded(documentType);
    })();

    this.loadingModels.set(documentType, loadPromise);
    return loadPromise;
  }

  private async loadRegisterAndBroadcast(documentType: string): Promise<void> {
    const source = await this.loader.load(documentType);
    const resolved = await resolveModelSources([source]);
    const hasRequested = resolved.modules.some(
      (module) => module.documentModel.global.id === documentType,
    );
    if (!hasRequested) {
      throw new Error(
        `Loader source resolved no module for document type: ${documentType}`,
      );
    }
    const results = this.registry.registerModules(...resolved.modules);
    for (const result of results) {
      if (
        result.status === "error" &&
        !DuplicateModuleError.isError(result.error)
      ) {
        throw result.error as Error;
      }
    }
    // Importable sources carry manifest entries; live modules do not, so a
    // module source registers host-side only and workers never hear of it.
    if (this.broadcastHook) {
      for (const entry of resolved.manifest) {
        await this.broadcastHook(entry);
      }
    }
  }

  // Best-effort peer notification; its failure must not fail the registered load.
  private async notifyPeersModelLoaded(documentType: string): Promise<void> {
    if (!this.modelLoadedHook) {
      return;
    }
    try {
      await this.modelLoadedHook(documentType);
    } catch (error) {
      this.logger.warn(`MODEL_LOADED hook failed: ${documentType}`, error);
    }
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
