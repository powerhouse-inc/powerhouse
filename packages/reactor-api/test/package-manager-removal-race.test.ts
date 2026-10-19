import type { SubgraphClass } from "@powerhousedao/reactor-api";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { PackageManager } from "../src/packages/package-manager.js";
import type { ISubscribablePackageLoader } from "../src/packages/types.js";

function makeSubgraphClass(name: string): SubgraphClass {
  return class extends BaseSubgraph {
    name = name;
  };
}

function makeDocumentModel(id: string): DocumentModelModule {
  return {
    documentModel: { global: { id } },
    version: 1,
  } as unknown as DocumentModelModule;
}

// A load started while held waits for release().
function makeHoldingLoader() {
  const subgraphs = new Map<string, SubgraphClass[]>();
  const documentModels = new Map<string, DocumentModelModule[]>();
  const handlers = {
    documentModels: new Map<string, () => void>(),
    subgraphs: new Map<string, () => void>(),
  };
  let held = false;
  let gate = Promise.resolve();
  let open = () => {};

  const pass = async <T>(value: () => T): Promise<T> => {
    if (held) await gate;
    return value();
  };

  const loader: ISubscribablePackageLoader = {
    name: "holding-loader",
    loadDocumentModels: (pkg) => pass(() => documentModels.get(pkg) ?? []),
    loadSubgraphs: (pkg) => pass(() => subgraphs.get(pkg) ?? []),
    loadProcessors: () => pass(() => null),
    loadPieces: () => pass(() => []),
    onDocumentModelsChange(pkg, handler) {
      handlers.documentModels.set(pkg, () => handler([]));
      return () => handlers.documentModels.delete(pkg);
    },
    onSubgraphsChange(pkg, handler) {
      handlers.subgraphs.set(pkg, () => handler([]));
      return () => handlers.subgraphs.delete(pkg);
    },
  };

  return {
    loader,
    subgraphs,
    documentModels,
    hold() {
      held = true;
      gate = new Promise<void>((resolve) => {
        open = resolve;
      });
    },
    letNewLoadsThrough() {
      held = false;
    },
    release() {
      held = false;
      open();
    },
    fire(kind: keyof typeof handlers, pkg: string) {
      handlers[kind].get(pkg)?.();
    },
  };
}

type Internals = {
  loadPackages(packages: string[]): Promise<unknown>;
  subscribedPackages: Set<string>;
};

describe("PackageManager removal while a load is in flight", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("an in-flight subgraphs update does not bring back a removed package", async () => {
    vi.useFakeTimers();
    const fake = makeHoldingLoader();
    fake.subgraphs.set("pkg-a", [makeSubgraphClass("alpha")]);
    const manager = new PackageManager([fake.loader], {
      packages: ["pkg-a"],
    });
    const events: Map<string, SubgraphClass[]>[] = [];
    manager.onSubgraphsChange((m) => events.push(m));
    await manager.init();

    fake.hold();
    fake.fire("subgraphs", "pkg-a");
    await vi.advanceTimersByTimeAsync(1000);
    manager.removePackage("pkg-a");
    fake.release();
    await vi.runAllTimersAsync();

    expect(events.at(-1)?.has("pkg-a")).toBe(false);
  });

  it("an in-flight document models update does not bring back a removed package", async () => {
    vi.useFakeTimers();
    const fake = makeHoldingLoader();
    fake.documentModels.set("pkg-a", [makeDocumentModel("acme/alpha")]);
    const manager = new PackageManager([fake.loader], {
      packages: ["pkg-a"],
    });
    const events: Record<string, DocumentModelModule[]>[] = [];
    manager.onDocumentModelsChange((m) => events.push(m));
    await manager.init();

    fake.hold();
    fake.fire("documentModels", "pkg-a");
    await vi.advanceTimersByTimeAsync(1000);
    manager.removePackage("pkg-a");
    fake.release();
    await vi.runAllTimersAsync();

    expect(events.at(-1)?.["pkg-a"]).toBeUndefined();
    expect(manager.getDocumentModels().has("pkg-a")).toBe(false);
  });

  it("a reload in flight does not bring back a removed package", async () => {
    vi.useFakeTimers();
    const fake = makeHoldingLoader();
    fake.subgraphs.set("pkg-a", [makeSubgraphClass("alpha")]);
    const manager = new PackageManager([fake.loader], {
      packages: ["pkg-a", "pkg-b"],
    });
    const events: Map<string, SubgraphClass[]>[] = [];
    manager.onSubgraphsChange((m) => events.push(m));
    await manager.init();

    fake.hold();
    const reload = (manager as unknown as Internals).loadPackages([
      "pkg-a",
      "pkg-b",
    ]);
    await vi.advanceTimersByTimeAsync(0);
    manager.removePackage("pkg-a");
    fake.release();
    await reload;

    expect(events.at(-1)?.has("pkg-a")).toBe(false);
    expect(events.at(-1)?.has("pkg-b")).toBe(true);
    expect((manager as unknown as Internals).subscribedPackages).toEqual(
      new Set(["pkg-b"]),
    );
  });

  it("an earlier reload that finishes last does not overwrite a newer one", async () => {
    vi.useFakeTimers();
    const fake = makeHoldingLoader();
    fake.subgraphs.set("pkg-a", [makeSubgraphClass("alpha")]);
    fake.subgraphs.set("pkg-b", [makeSubgraphClass("beta")]);
    const manager = new PackageManager([fake.loader], {
      packages: ["pkg-a", "pkg-b"],
    });
    const events: Map<string, SubgraphClass[]>[] = [];
    manager.onSubgraphsChange((m) => events.push(m));
    await manager.init();
    const internals = manager as unknown as Internals;

    fake.hold();
    const older = internals.loadPackages(["pkg-a", "pkg-b"]);
    await vi.advanceTimersByTimeAsync(0);
    fake.letNewLoadsThrough();
    const newer = internals.loadPackages(["pkg-a"]);
    await vi.advanceTimersByTimeAsync(0);
    fake.release();
    await Promise.all([older, newer]);

    expect(events.at(-1)?.has("pkg-b")).toBe(false);
    expect(internals.subscribedPackages).toEqual(new Set(["pkg-a"]));
  });
});
