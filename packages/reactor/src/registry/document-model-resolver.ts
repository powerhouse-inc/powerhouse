import { DuplicateModuleError, ModuleNotFoundError } from "./implementation.js";
import type {
  IDocumentModelLoader,
  IDocumentModelRegistry,
} from "./interfaces.js";

export interface IDocumentModelResolver {
  ensureModelLoaded(documentType: string): Promise<void>;
}

/**
 * Encapsulates the logic for resolving document model modules on demand.
 * Shared between the queue (CREATE_DOCUMENT gate) and the executor manager
 * (post-failure recovery) so that both paths use the same deduplication
 * and failure-caching state.
 */
export class DocumentModelResolver implements IDocumentModelResolver {
  private loadingModels = new Map<string, Promise<void>>();
  private failedModelTypes = new Set<string>();

  constructor(
    private registry: IDocumentModelRegistry,
    private loader: IDocumentModelLoader,
  ) {}

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
        try {
          this.registry.registerModules(module);
        } catch (registerError) {
          if (!DuplicateModuleError.isError(registerError)) {
            throw registerError;
          }
        }
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
