import { DEPRECATIONS_WARNED_ENV } from "@powerhousedao/shared/clis/deprecations";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { gql } from "graphql-tag";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { defineIndexSubgraph } from "../src/graphql/index-subgraph.js";
import type { SubgraphClass } from "../src/graphql/types.js";
import {
  isLegacySubgraphClass,
  warnLegacyAuthoring,
} from "../src/packages/legacy-authoring.js";
import { PackageManager } from "../src/packages/package-manager.js";
import type { ISubscribablePackageLoader } from "../src/packages/types.js";
import { ShopSubgraph } from "./fixtures/code-first/shop.js";
import { boardModel } from "./utils/code-first-models.js";

const PROJECT = "/work/todo-project";
const INSTALLED = "@acme/installed";

const MODELS_AND_SUBGRAPHS =
  "Warning: This project has legacy document models (acme/todo) and legacy subgraphs (SearchSubgraph). " +
  "6.4 removes support for them. " +
  "Run `ph migrate --document-models --subgraphs` to convert them, " +
  "or write document models with defineDocumentModel (`ph generate document-model --name <name>`) " +
  "and subgraphs with the Subgraph class (`ph generate subgraph --name <name>`).";
const MODELS_ONLY =
  "Warning: This project has legacy document models (acme/todo). " +
  "6.4 removes support for them. " +
  "Run `ph migrate --document-models` to convert them, " +
  "or write document models with defineDocumentModel (`ph generate document-model --name <name>`).";
const SUBGRAPHS_ONLY =
  "Warning: This project has legacy subgraphs (SearchSubgraph). " +
  "6.4 removes support for them. " +
  "Run `ph migrate --subgraphs` to convert them, " +
  "or write subgraphs with the Subgraph class (`ph generate subgraph --name <name>`).";

function legacyModel(id: string): DocumentModelModule {
  return {
    documentModel: { global: { id } },
    version: 1,
  } as unknown as DocumentModelModule;
}

class SearchSubgraph extends BaseSubgraph {
  override name = "search";
}

const MailIndexSubgraph = defineIndexSubgraph({
  name: "mail",
  typeDefs: gql`
    type MailQueries {
      version: String!
    }
    type Query {
      mail: MailQueries!
    }
  `,
  index: () => ({}),
  access: {
    scope: { drive: "driveId" },
    fields: { "MailQueries.version": { public: true } },
  },
  queries: { "MailQueries.version": () => "1" },
}) as SubgraphClass;

function makeLoader() {
  const documentModels = new Map<string, DocumentModelModule[]>();
  const subgraphs = new Map<string, SubgraphClass[]>();
  const handlers = {
    documentModels: new Map<string, () => void>(),
    subgraphs: new Map<string, () => void>(),
  };
  const loader: ISubscribablePackageLoader = {
    name: "fake-loader",
    loadDocumentModels: (pkg) => Promise.resolve(documentModels.get(pkg) ?? []),
    loadSubgraphs: (pkg) => Promise.resolve(subgraphs.get(pkg) ?? []),
    loadProcessors: () => Promise.resolve(null),
    loadPieces: () => Promise.resolve([]),
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
    documentModels,
    subgraphs,
    // A file change reaches the manager through the loader, debounced.
    async reload(kind: keyof typeof handlers, pkg: string) {
      handlers[kind].get(pkg)?.();
      await vi.advanceTimersByTimeAsync(1000);
    },
  };
}

describe("isLegacySubgraphClass", () => {
  it("is true for a class that extends BaseSubgraph", () => {
    expect(isLegacySubgraphClass(SearchSubgraph)).toBe(true);
  });

  it("is false for a Subgraph class", () => {
    expect(isLegacySubgraphClass(ShopSubgraph as SubgraphClass)).toBe(false);
  });

  it.each([
    ["an object", {}],
    ["undefined", undefined],
    ["a class that does not extend BaseSubgraph", class Unrelated {}],
  ])("is false for %s, which is no subgraph class", (_, value) => {
    expect(isLegacySubgraphClass(value)).toBe(false);
  });

  it("is false for the class defineIndexSubgraph returns and for a class that extends it", () => {
    class Extended extends MailIndexSubgraph {}
    expect(isLegacySubgraphClass(MailIndexSubgraph)).toBe(false);
    expect(isLegacySubgraphClass(Extended)).toBe(false);
  });
});

describe("warnLegacyAuthoring", () => {
  const loaded = {
    documentModels: [legacyModel("acme/todo")],
    subgraphs: [SearchSubgraph],
  };

  it("warns once per project, and a child that inherits the env is silent", () => {
    const env: Record<string, string | undefined> = {};
    const lines: string[] = [];
    const warn = (line: string) => lines.push(line);
    warnLegacyAuthoring("/work/a,b", loaded, warn, env);
    warnLegacyAuthoring("/work/a,b", loaded, warn, env);
    warnLegacyAuthoring("/work/a,b", loaded, warn, { ...env });
    expect(lines).toEqual([MODELS_AND_SUBGRAPHS]);
    // A comma in the path does not stand for two projects.
    warnLegacyAuthoring("/work/a", loaded, warn, env);
    warnLegacyAuthoring("b", loaded, warn, env);
    expect(lines).toHaveLength(3);
  });

  it("names a legacy subgraph class that has no name", () => {
    const lines: string[] = [];
    warnLegacyAuthoring(
      PROJECT,
      {
        documentModels: [],
        subgraphs: [(() => class extends BaseSubgraph {})(), SearchSubgraph],
      },
      (line) => lines.push(line),
      {},
    );
    expect(lines).toEqual([
      SUBGRAPHS_ONLY.replace(
        "(SearchSubgraph)",
        "(an unnamed class, SearchSubgraph)",
      ),
    ]);
  });

  it("is silent for a project with nothing legacy, and warns once it has a legacy module", () => {
    const env: Record<string, string | undefined> = {};
    const lines: string[] = [];
    const warn = (line: string) => lines.push(line);
    warnLegacyAuthoring(
      PROJECT,
      { documentModels: [boardModel()], subgraphs: [] },
      warn,
      env,
    );
    expect(lines).toEqual([]);
    warnLegacyAuthoring(
      PROJECT,
      {
        documentModels: [boardModel(), legacyModel("acme/todo")],
        subgraphs: [],
      },
      warn,
      env,
    );
    expect(lines).toEqual([MODELS_ONLY]);
  });
});

describe("the package manager's development warning for legacy authoring", () => {
  let logged: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv(DEPRECATIONS_WARNED_ENV, "");
    logged = [];
    vi.spyOn(console, "warn").mockImplementation((...parts: unknown[]) => {
      logged.push(parts.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const warnings = () =>
    logged
      .filter((line) => line.includes("legacy"))
      .map((line) => line.slice(line.indexOf("Warning: ")));

  function devHost(fake: ReturnType<typeof makeLoader>) {
    return new PackageManager([fake.loader], {
      packages: [PROJECT, INSTALLED],
      devProject: PROJECT,
    });
  }

  it("warns through the logger on the first load, naming only the project's legacy modules", async () => {
    const fake = makeLoader();
    fake.documentModels.set(PROJECT, [legacyModel("acme/todo"), boardModel()]);
    fake.subgraphs.set(PROJECT, [
      SearchSubgraph,
      ShopSubgraph as SubgraphClass,
    ]);
    await devHost(fake).init();
    expect(warnings()).toEqual([MODELS_AND_SUBGRAPHS]);
    expect(logged.filter((line) => line.includes("legacy"))[0]).toContain(
      "[reactor-api][package-manager] Warning: ",
    );
  });

  it("names a document model with several versions once", async () => {
    const fake = makeLoader();
    fake.documentModels.set(PROJECT, [
      legacyModel("acme/todo"),
      { ...legacyModel("acme/todo"), version: 2 },
    ]);
    await devHost(fake).init();
    expect(warnings()).toEqual([MODELS_ONLY]);
  });

  it("is silent for a host that is not in development", async () => {
    const fake = makeLoader();
    fake.documentModels.set(PROJECT, [legacyModel("acme/todo")]);
    fake.subgraphs.set(PROJECT, [SearchSubgraph]);
    await new PackageManager([fake.loader], { packages: [PROJECT] }).init();
    expect(warnings()).toEqual([]);
  });

  it("is silent when the only legacy package is an installed one", async () => {
    const fake = makeLoader();
    fake.documentModels.set(INSTALLED, [legacyModel("acme/installed")]);
    fake.subgraphs.set(INSTALLED, [SearchSubgraph]);
    const manager = devHost(fake);
    await manager.init();
    await fake.reload("documentModels", INSTALLED);
    await fake.reload("subgraphs", INSTALLED);
    expect(manager.getDocumentModels().get(INSTALLED)).toHaveLength(1);
    expect(warnings()).toEqual([]);
  });

  it("is silent for a project in the new form only", async () => {
    const fake = makeLoader();
    fake.documentModels.set(PROJECT, [boardModel()]);
    fake.subgraphs.set(PROJECT, [ShopSubgraph as SubgraphClass]);
    await devHost(fake).init();
    expect(warnings()).toEqual([]);
  });

  it("is silent for an index subgraph", async () => {
    const fake = makeLoader();
    fake.subgraphs.set(PROJECT, [MailIndexSubgraph]);
    await devHost(fake).init();
    expect(warnings()).toEqual([]);
  });

  it("is silent on reloads of the same project, also when its legacy modules change", async () => {
    const fake = makeLoader();
    fake.documentModels.set(PROJECT, [legacyModel("acme/todo")]);
    fake.subgraphs.set(PROJECT, [SearchSubgraph]);
    const manager = devHost(fake);
    await manager.init();
    await fake.reload("documentModels", PROJECT);
    await fake.reload("subgraphs", PROJECT);
    fake.documentModels.set(PROJECT, [
      legacyModel("acme/todo"),
      legacyModel("acme/invoice"),
    ]);
    await fake.reload("documentModels", PROJECT);
    expect(manager.getDocumentModels().get(PROJECT)).toHaveLength(2);
    expect(warnings()).toEqual([MODELS_AND_SUBGRAPHS]);
  });

  it("warns when the project's first legacy document model arrives with a reload", async () => {
    const fake = makeLoader();
    fake.documentModels.set(PROJECT, [boardModel()]);
    await devHost(fake).init();
    expect(warnings()).toEqual([]);
    fake.documentModels.set(PROJECT, [boardModel(), legacyModel("acme/todo")]);
    await fake.reload("documentModels", PROJECT);
    await fake.reload("documentModels", PROJECT);
    expect(warnings()).toEqual([MODELS_ONLY]);
  });

  it("warns when the project's first legacy subgraph arrives with a reload", async () => {
    const fake = makeLoader();
    await devHost(fake).init();
    expect(warnings()).toEqual([]);
    fake.subgraphs.set(PROJECT, [SearchSubgraph]);
    await fake.reload("subgraphs", PROJECT);
    await fake.reload("subgraphs", PROJECT);
    expect(warnings()).toEqual([SUBGRAPHS_ONLY]);
  });

  it("does not fail a load when it cannot read what the project loaded", async () => {
    const unreadable = Object.defineProperty(
      class extends BaseSubgraph {},
      "name",
      {
        get(): string {
          throw new Error("unreadable");
        },
      },
    );
    const fake = makeLoader();
    fake.subgraphs.set(PROJECT, [unreadable]);
    const manager = devHost(fake);
    await expect(manager.init()).resolves.toBeDefined();
    await fake.reload("subgraphs", PROJECT);
    expect(manager.hasPackage(PROJECT)).toBe(true);
    expect(warnings()).toEqual([]);
  });

  it("warns once per process: a second manager for the same project is silent", async () => {
    const fake = makeLoader();
    fake.documentModels.set(PROJECT, [legacyModel("acme/todo")]);
    await devHost(fake).init();
    await devHost(fake).init();
    expect(warnings()).toEqual([MODELS_ONLY]);
  });
});
