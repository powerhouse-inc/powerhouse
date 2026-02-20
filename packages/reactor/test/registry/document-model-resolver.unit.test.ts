import type { DocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentModelResolver } from "../../src/registry/document-model-resolver.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type {
  IDocumentModelLoader,
  IDocumentModelRegistry,
} from "../../src/registry/interfaces.js";

function createMockModule(documentType: string): DocumentModelModule<any> {
  return {
    documentModel: {
      global: { id: documentType },
    },
    reducer: vi.fn(),
    utils: {},
  } as unknown as DocumentModelModule<any>;
}

describe("DocumentModelResolver", () => {
  let registry: IDocumentModelRegistry;
  let loader: IDocumentModelLoader;
  let resolver: DocumentModelResolver;

  beforeEach(() => {
    registry = new DocumentModelRegistry();
    loader = {
      load: vi.fn(),
    };
    resolver = new DocumentModelResolver(registry, loader);
  });

  it("should return immediately if module is already registered", async () => {
    const module = createMockModule("test/type");
    registry.registerModules(module);

    await resolver.ensureModelLoaded("test/type");

    expect(loader.load).not.toHaveBeenCalled();
  });

  it("should load and register a module", async () => {
    const module = createMockModule("test/type");
    vi.mocked(loader.load).mockResolvedValue(module);

    await resolver.ensureModelLoaded("test/type");

    expect(loader.load).toHaveBeenCalledWith("test/type");
    expect(registry.getModule("test/type")).toBe(module);
  });

  it("should deduplicate concurrent loads for the same type", async () => {
    const module = createMockModule("test/type");
    let resolveLoad!: (value: DocumentModelModule<any>) => void;
    vi.mocked(loader.load).mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const promise1 = resolver.ensureModelLoaded("test/type");
    const promise2 = resolver.ensureModelLoaded("test/type");

    resolveLoad(module);

    await Promise.all([promise1, promise2]);

    expect(loader.load).toHaveBeenCalledTimes(1);
  });

  it("should cache failed types and throw on subsequent attempts", async () => {
    vi.mocked(loader.load).mockRejectedValue(new Error("Network error"));

    await expect(resolver.ensureModelLoaded("bad/type")).rejects.toThrow(
      "Network error",
    );

    await expect(resolver.ensureModelLoaded("bad/type")).rejects.toThrow(
      "Document model type previously failed to load: bad/type",
    );

    expect(loader.load).toHaveBeenCalledTimes(1);
  });

  it("should handle DuplicateModuleError gracefully", async () => {
    const module = createMockModule("test/type");
    registry.registerModules(module);

    const duplicateModule = createMockModule("test/type");
    vi.mocked(loader.load).mockResolvedValue(duplicateModule);

    // Clear the registry check by using a fresh resolver that checks the
    // registry AFTER another path has already registered the module
    const freshRegistry = new DocumentModelRegistry();
    const freshResolver = new DocumentModelResolver(freshRegistry, loader);

    // First call from path A loads it
    await freshResolver.ensureModelLoaded("test/type");
    expect(freshRegistry.getModule("test/type")).toBe(duplicateModule);

    // Simulate a concurrent path that already registered the same type
    // by creating a resolver where the registry is pre-populated but
    // the loader returns the same module
    vi.mocked(loader.load).mockResolvedValue(createMockModule("test/type"));

    // This should not throw despite the duplicate
    await expect(
      resolver.ensureModelLoaded("test/type"),
    ).resolves.not.toThrow();
  });

  it("should propagate non-ModuleNotFoundError from registry.getModule", async () => {
    const errorRegistry: IDocumentModelRegistry = {
      ...registry,
      getModule: () => {
        throw new Error("Unexpected registry error");
      },
    } as unknown as IDocumentModelRegistry;

    const errorResolver = new DocumentModelResolver(errorRegistry, loader);

    await expect(errorResolver.ensureModelLoaded("test/type")).rejects.toThrow(
      "Unexpected registry error",
    );

    expect(loader.load).not.toHaveBeenCalled();
  });
});
