import type {
  ProcessorFactoryBuilder,
  SubgraphClass,
} from "@powerhousedao/reactor-api";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { PackageManager } from "../src/packages/package-manager.js";
import type {
  ISubscribablePackageLoader,
  PackagePieceEntry,
} from "../src/packages/types.js";

function makeSubgraphClass(name: string): SubgraphClass {
  return class extends BaseSubgraph {
    static override readonly subgraphName: string = name;
  };
}

function makeProcessorBuilder(): ProcessorFactoryBuilder {
  return vi.fn() as unknown as ProcessorFactoryBuilder;
}

/**
 * In-memory subscribable loader: the test mutates its maps and fires the
 * package's change events, standing in for a hot-reload event from a real
 * loader.
 */
function makeFakeLoader() {
  const subgraphs = new Map<string, SubgraphClass[]>();
  const processors = new Map<string, ProcessorFactoryBuilder>();
  type AnyHandler = (item: unknown) => void;
  const subscriptions = {
    documentModels: new Map<string, Array<AnyHandler>>(),
    subgraphs: new Map<string, Array<AnyHandler>>(),
    processors: new Map<string, Array<AnyHandler>>(),
  };

  const subscribe = <T>(
    key: keyof typeof subscriptions,
    pkg: string,
    handler: T,
  ) => {
    const list = subscriptions[key].get(pkg) ?? [];
    subscriptions[key].set(pkg, list);
    list.push(handler as unknown as AnyHandler);
    return () => {
      const i = list.indexOf(handler as unknown as AnyHandler);
      if (i >= 0) list.splice(i, 1);
    };
  };

  const loader: ISubscribablePackageLoader = {
    name: "fake-loader",
    loadDocumentModels(): Promise<DocumentModelModule[]> {
      return Promise.resolve([]);
    },
    loadSubgraphs(pkg: string): Promise<SubgraphClass[]> {
      return Promise.resolve(subgraphs.get(pkg) ?? []);
    },
    loadProcessors(pkg: string): Promise<ProcessorFactoryBuilder | null> {
      return Promise.resolve(processors.get(pkg) ?? null);
    },
    loadPieces(): Promise<PackagePieceEntry[]> {
      return Promise.resolve([]);
    },
    onDocumentModelsChange(pkg, handler) {
      return subscribe("documentModels", pkg, handler);
    },
    onSubgraphsChange(pkg, handler) {
      return subscribe("subgraphs", pkg, handler);
    },
    onProcessorsChange(pkg, handler) {
      return subscribe("processors", pkg, handler);
    },
  };

  return {
    loader,
    subgraphs,
    processors,
    fireSubgraphsChange(pkg: string) {
      for (const handler of subscriptions.subgraphs.get(pkg) ?? []) {
        handler(subgraphs.get(pkg) ?? []);
      }
    },
    fireProcessorsChange(pkg: string) {
      for (const handler of subscriptions.processors.get(pkg) ?? []) {
        handler(processors.get(pkg) ?? null);
      }
    },
  };
}

describe("PackageManager teardown (issue #2973)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops the subgraphs key when a package stops contributing subgraphs", async () => {
    vi.useFakeTimers();
    const fake = makeFakeLoader();
    fake.subgraphs.set("pkg-a", [makeSubgraphClass("alpha")]);
    const manager = new PackageManager([fake.loader], {
      packages: ["pkg-a"],
    });
    const events: Map<string, SubgraphClass[]>[] = [];
    manager.onSubgraphsChange((m) => events.push(m));

    await manager.init();
    expect(events.at(-1)?.has("pkg-a")).toBe(true);

    // The package deleted its subgraphs entry: the change event must
    // signal removal, not re-assert an empty entry.
    fake.subgraphs.delete("pkg-a");
    fake.fireSubgraphsChange("pkg-a");
    await vi.runAllTimersAsync();

    expect(events.at(-1)?.has("pkg-a")).toBe(false);
  });

  it("drops the processors key when a package stops contributing processors", async () => {
    vi.useFakeTimers();
    const fake = makeFakeLoader();
    fake.processors.set("pkg-a", makeProcessorBuilder());
    const manager = new PackageManager([fake.loader], {
      packages: ["pkg-a"],
    });
    const events: Map<string, ProcessorFactoryBuilder[]>[] = [];
    manager.onProcessorsChange((m) => events.push(m));

    await manager.init();
    expect(events.at(-1)?.has("pkg-a")).toBe(true);

    fake.processors.delete("pkg-a");
    fake.fireProcessorsChange("pkg-a");
    await vi.runAllTimersAsync();

    expect(events.at(-1)?.has("pkg-a")).toBe(false);
  });

  it("removePackage drops the package from all maps and emits the change events", async () => {
    const fake = makeFakeLoader();
    fake.subgraphs.set("pkg-a", [makeSubgraphClass("alpha")]);
    fake.processors.set("pkg-a", makeProcessorBuilder());
    const manager = new PackageManager([fake.loader], {
      packages: ["pkg-a", "pkg-b"],
    });
    const subEvents: Map<string, SubgraphClass[]>[] = [];
    const procEvents: Map<string, ProcessorFactoryBuilder[]>[] = [];
    const docEvents: Record<string, DocumentModelModule[]>[] = [];
    manager.onSubgraphsChange((m) => subEvents.push(m));
    manager.onProcessorsChange((m) => procEvents.push(m));
    manager.onDocumentModelsChange((m) => docEvents.push(m));

    await manager.init();

    manager.removePackage("pkg-a");

    expect(subEvents.at(-1)?.has("pkg-a")).toBe(false);
    expect(procEvents.at(-1)?.has("pkg-a")).toBe(false);
    const lastDoc = docEvents.at(-1)!;
    expect(lastDoc["pkg-a"]).toBeUndefined();
    // Other packages and the static prereq document-model packages stay.
    expect(lastDoc["pkg-b"]).toBeDefined();
    expect(lastDoc["document-drive"]).toBeDefined();
  });

  it("a pending update does not bring back a removed package", async () => {
    vi.useFakeTimers();
    const fake = makeFakeLoader();
    fake.subgraphs.set("pkg-a", [makeSubgraphClass("alpha")]);
    const manager = new PackageManager([fake.loader], {
      packages: ["pkg-a"],
    });
    const events: Map<string, SubgraphClass[]>[] = [];
    manager.onSubgraphsChange((m) => events.push(m));
    await manager.init();

    fake.fireSubgraphsChange("pkg-a");
    manager.removePackage("pkg-a");
    await vi.runAllTimersAsync();

    expect(events.at(-1)?.has("pkg-a")).toBe(false);
  });

  it("a pending update does not bring back a package a reload dropped", async () => {
    vi.useFakeTimers();
    const fake = makeFakeLoader();
    fake.subgraphs.set("pkg-a", [makeSubgraphClass("alpha")]);
    const manager = new PackageManager([fake.loader], {
      packages: ["pkg-a"],
    });
    const events: Map<string, SubgraphClass[]>[] = [];
    manager.onSubgraphsChange((m) => events.push(m));
    await manager.init();

    fake.fireSubgraphsChange("pkg-a");
    const reload = manager as unknown as {
      loadPackages(packages: string[]): Promise<unknown>;
    };
    await reload.loadPackages([]);
    await vi.runAllTimersAsync();

    expect(events.at(-1)?.has("pkg-a")).toBe(false);
  });
});

describe("PackageManager keeps the last loaded set of a failed package", () => {
  const piece: PackagePieceEntry = {
    name: "piece-a",
    version: "1.0.0",
    entryPath: "/pkg-a/piece.mjs",
  };
  const subgraph = makeSubgraphClass("alpha");
  const processor = makeProcessorBuilder();
  const broken = new Error("Transform failed with 1 error");
  const missing = Object.assign(
    new Error("Cannot find package 'pkg-a' imported from /host"),
    { code: "ERR_MODULE_NOT_FOUND" },
  );

  function setup() {
    let failure: Error | undefined;
    const answer = <T>(value: T) =>
      failure ? Promise.reject(failure) : Promise.resolve(value);
    const fire: (() => void)[] = [];
    const loader: ISubscribablePackageLoader = {
      name: "fake-loader",
      loadDocumentModels: () => answer([]),
      loadSubgraphs: () => answer([subgraph]),
      loadProcessors: () => answer(processor),
      loadPieces: () => answer([piece]),
      onSubgraphsChange: (_, handler) => {
        fire.push(() => handler([]));
        return () => {};
      },
      onProcessorsChange: (_, handler) => {
        fire.push(() => handler(null));
        return () => {};
      },
      onPiecesChange: (_, handler) => {
        fire.push(() => handler([]));
        return () => {};
      },
    };
    const manager = new PackageManager([loader], { packages: ["pkg-a"] });
    const last = {
      subgraphs: undefined as Map<string, SubgraphClass[]> | undefined,
      processors: undefined as
        | Map<string, ProcessorFactoryBuilder[]>
        | undefined,
      pieces: undefined as Map<string, PackagePieceEntry[]> | undefined,
    };
    manager.onSubgraphsChange((m) => (last.subgraphs = m));
    manager.onProcessorsChange((m) => (last.processors = m));
    manager.onPiecesChange((m) => (last.pieces = m));
    return {
      manager,
      last,
      fail: (error: Error) => {
        failure = error;
      },
      reloadConfig: () =>
        (
          manager as unknown as {
            loadPackages(packages: string[]): Promise<unknown>;
          }
        ).loadPackages(["pkg-a"]),
      changed: async () => {
        for (const handler of fire) handler();
        await vi.runAllTimersAsync();
      },
    };
  }

  it.each([
    ["a config reload", (h: ReturnType<typeof setup>) => h.reloadConfig()],
    ["a change", (h: ReturnType<typeof setup>) => h.changed()],
  ])("keeps them when %s fails", async (_, reload) => {
    vi.useFakeTimers();
    const harness = setup();
    await harness.manager.init();

    harness.fail(broken);
    await reload(harness);

    expect(harness.last.subgraphs?.get("pkg-a")).toEqual([subgraph]);
    expect(harness.last.processors?.get("pkg-a")).toEqual([processor]);
    expect(harness.last.pieces?.get("pkg-a")).toEqual([piece]);
  });

  it("drops them when a config reload finds the package absent", async () => {
    const harness = setup();
    await harness.manager.init();

    harness.fail(missing);
    await harness.reloadConfig();

    expect(harness.last.subgraphs?.get("pkg-a")).toEqual([]);
    expect(harness.last.processors?.get("pkg-a")).toEqual([]);
    expect(harness.last.pieces?.get("pkg-a")).toEqual([]);
  });
});
