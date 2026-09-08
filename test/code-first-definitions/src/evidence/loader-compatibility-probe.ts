import type {
  DocumentModelLib,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import type { TypeScriptSourceImportInterface } from "document-model/tooling";
import { DefinitionSourceLoader } from "document-model/tooling";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NodeBuildTypeScriptSourceImportAdapter } from "../../../../clis/ph-cli/src/services/definition-import-build.js";
import { ViteTypeScriptSourceImportAdapter } from "../../../../clis/ph-cli/src/services/definition-import-vite.js";
import { DocumentModelRegistry } from "../../../../packages/reactor/src/registry/implementation.js";
import { resolveModelSources } from "../../../../packages/reactor/src/core/model-sources.js";
import { defaultLoadFactory } from "../../../../packages/reactor/src/executor/worker/build-worker-executor.js";
import { StaticPackageManager } from "../../../../packages/reactor-browser/src/graphql-client/static-package-manager.js";
import { WorkerPackageLoader } from "../../../../packages/reactor-browser/src/rpc/worker-package-loader.js";
import { ImportPackageLoader } from "../../../../packages/reactor-api/src/packages/import-loader.js";
import { extractSubgraphsFromModule } from "../../../../packages/reactor-api/src/packages/http-loader.js";
import { PackageManager } from "../../../../packages/reactor-api/src/packages/package-manager.js";
import type { IPackageLoader } from "../../../../packages/reactor-api/src/packages/types.js";
import { VitePackageLoader as ReactorApiVitePackageLoader } from "../../../../packages/reactor-api/src/packages/vite-loader.mjs";
import { VitePackageLoader as McpVitePackageLoader } from "../../../../packages/reactor-mcp/src/stdio/loader.js";
import {
  LoaderModelV1 as CodeFirstLoaderModelV1,
  LoaderModelV2 as CodeFirstLoaderModelV2,
  documentModels as codeFirstDocumentModels,
  upgradeManifests as codeFirstUpgradeManifests,
} from "../../fixtures/packages/v1/source-models.js";
import {
  LoaderModelV1 as LegacyLoaderModelV1,
  LoaderModelV2 as LegacyLoaderModelV2,
  documentModels as legacyDocumentModels,
  upgradeManifests as legacyUpgradeManifests,
} from "../../fixtures/packages/v1/legacy-models.js";
import {
  CodeFirstLoaderSubgraph,
  LegacyLoaderSubgraph,
} from "../../fixtures/packages/v1/subgraphs.js";
import { compareCodeUnits, firstDifference, sha256 } from "./utils.js";

export const B8_HOSTS = [
  "definition-source",
  "node-server",
  "http-cdn",
  "vite-local",
  "browser-static",
  "browser-worker",
  "graphql",
  "mcp",
  "connect",
  "reactor-worker",
  "registry",
] as const;

export type B8HostId = (typeof B8_HOSTS)[number];

export type LoaderHostResult = {
  readonly hostId: B8HostId;
  readonly importedNamespace: readonly string[];
  readonly acceptedExports: readonly string[];
  readonly selectedNamedWorkerReference: {
    readonly specifier: string;
    readonly exportName: string;
  } | null;
  readonly diagnostics: readonly string[];
  readonly registrationOutcome: string;
  readonly firstMismatch: string | null;
};

export type LoaderCompatibilityProbeResult = {
  readonly hosts: readonly LoaderHostResult[];
  readonly definitionSource: {
    readonly sourceSetDigest: `sha256:${string}`;
    readonly normalizedSources: readonly string[];
    readonly acceptedExports: readonly string[];
    readonly importCount: number;
  };
};

type HostObservation = Omit<LoaderHostResult, "hostId" | "firstMismatch">;
type ModelMode = "legacy" | "code-first";

const packageRoot = resolve(import.meta.dirname, "../..");
const repositoryRoot = resolve(packageRoot, "../..");
const fixtureRoot = resolve(packageRoot, "fixtures/packages/v1");
const fixtureDocumentType = "powerhouse/loader-fixture";

function valueKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function flatNamespace(
  namespace: Readonly<Record<string, unknown>>,
  prefix = "",
): string[] {
  return Object.entries(namespace)
    .map(([key, value]) => `${prefix}${key}:${valueKind(value)}`)
    .sort(compareCodeUnits);
}

function nestedNamespace(
  namespace: Readonly<Record<string, unknown>>,
  prefix = "",
): string[] {
  return Object.entries(namespace)
    .flatMap(([outer, value]) => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return [`${prefix}${outer}:${valueKind(value)}`];
      }
      return Object.entries(value as Record<string, unknown>).map(
        ([inner, nested]) => `${prefix}${outer}.${inner}:${valueKind(nested)}`,
      );
    })
    .sort(compareCodeUnits);
}

function modelKey(module: DocumentModelModule<any>): string {
  return `${module.documentModel.global.id}@${module.version ?? 1}`;
}

function modelKeys(modules: readonly DocumentModelModule<any>[]): string[] {
  return modules.map(modelKey).sort(compareCodeUnits);
}

function fixtureModels(mode: ModelMode): readonly DocumentModelModule<any>[] {
  return mode === "legacy" ? legacyDocumentModels : codeFirstDocumentModels;
}

function fixtureManifests(mode: ModelMode) {
  return mode === "legacy" ? legacyUpgradeManifests : codeFirstUpgradeManifests;
}

function fixtureSubgraph(mode: ModelMode) {
  return mode === "legacy" ? LegacyLoaderSubgraph : CodeFirstLoaderSubgraph;
}

function documentNamespace(mode: ModelMode): Record<string, unknown> {
  const models = fixtureModels(mode);
  return {
    LoaderModelV1: models[0],
    LoaderModelV2: models[1],
    documentModels: models,
    ignored: `${mode}-helper`,
    upgradeManifests: fixtureManifests(mode),
  };
}

function subgraphNamespace(
  mode: ModelMode,
): Record<string, Record<string, unknown>> {
  const Subgraph = fixtureSubgraph(mode);
  return {
    LoaderSubgraph: {
      LoaderSubgraph: Subgraph,
      helper: `${mode}-helper`,
    },
    GenericAlias: {
      Subgraph,
      default: Subgraph,
      helper: `${mode}-generic-helper`,
    },
  };
}

async function paired(
  hostId: B8HostId,
  observe: (mode: ModelMode) => Promise<HostObservation>,
): Promise<LoaderHostResult> {
  const legacy = await observe("legacy");
  const codeFirst = await observe("code-first");
  return {
    hostId,
    ...codeFirst,
    firstMismatch: firstDifference(legacy, codeFirst),
  };
}

function sourceLabel(source: {
  readonly specifier: string;
  readonly exportPath?: readonly string[];
}): string {
  const fragment = source.exportPath
    ?.map((segment) => segment.replaceAll("~", "~0").replaceAll("/", "~1"))
    .join("/");
  return fragment ? `${source.specifier}#/${fragment}` : source.specifier;
}

async function definitionSourceHost(): Promise<{
  readonly host: LoaderHostResult;
  readonly source: LoaderCompatibilityProbeResult["definitionSource"];
}> {
  const configFile = resolve(fixtureRoot, "powerhouse.config.json");
  const revision = sha256("B8 loader fixture revision");

  async function observe(
    adapter:
      | ViteTypeScriptSourceImportAdapter
      | NodeBuildTypeScriptSourceImportAdapter,
  ): Promise<
    HostObservation & {
      readonly sourceSetDigest: `sha256:${string}`;
      readonly importCount: number;
    }
  > {
    const calls: string[] = [];
    const importer: TypeScriptSourceImportInterface = {
      async importModule(request) {
        calls.push(request.specifier);
        return adapter.importModule(request);
      },
    };
    try {
      const loaded = await new DefinitionSourceLoader(importer).load({
        configFile,
        packageRevision: revision,
      });
      const acceptedExports = loaded.values
        .map(({ value }) => modelKey(value as DocumentModelModule<any>))
        .sort(compareCodeUnits);
      return {
        importedNamespace: loaded.sourceSet.sources.map(sourceLabel),
        acceptedExports,
        selectedNamedWorkerReference: null,
        diagnostics: loaded.diagnostics.map(({ code }) => code),
        registrationOutcome: `${loaded.status}:values=${loaded.values.length}:imports=${calls.length}`,
        sourceSetDigest: loaded.sourceSet.digest,
        importCount: calls.length,
      };
    } finally {
      await adapter.close();
    }
  }

  const [vite, build] = await Promise.all([
    observe(new ViteTypeScriptSourceImportAdapter()),
    observe(new NodeBuildTypeScriptSourceImportAdapter()),
  ]);
  const { sourceSetDigest, importCount, ...buildObservation } = build;
  const {
    sourceSetDigest: _viteDigest,
    importCount: _viteImports,
    ...viteObservation
  } = vite;
  return {
    host: {
      hostId: "definition-source",
      ...buildObservation,
      firstMismatch: firstDifference(viteObservation, buildObservation),
    },
    source: {
      sourceSetDigest,
      normalizedSources: buildObservation.importedNamespace,
      acceptedExports: buildObservation.acceptedExports,
      importCount,
    },
  };
}

async function createRuntimeFixtureRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "powerhouse-b8-runtime-"));
  const subgraphsUrl = pathToFileURL(resolve(fixtureRoot, "subgraphs.ts")).href;
  await Promise.all(
    (["legacy", "code-first"] as const).flatMap((mode) => {
      const runtimeRoot = resolve(root, mode);
      const documentModelsDirectory = resolve(
        runtimeRoot,
        "dist/node/document-models",
      );
      const subgraphsDirectory = resolve(runtimeRoot, "dist/node/subgraphs");
      const modelsUrl = pathToFileURL(
        resolve(
          fixtureRoot,
          mode === "legacy" ? "legacy-models.ts" : "source-models.ts",
        ),
      ).href;
      const subgraphExport =
        mode === "legacy" ? "LegacyLoaderSubgraph" : "CodeFirstLoaderSubgraph";
      return [
        mkdir(documentModelsDirectory, { recursive: true }).then(() =>
          writeFile(
            resolve(documentModelsDirectory, "index.mjs"),
            [
              `import * as source from ${JSON.stringify(modelsUrl)};`,
              "export const LoaderModelV1 = source.LoaderModelV1;",
              "export const LoaderModelV2 = source.LoaderModelV2;",
              "export const documentModels = source.documentModels;",
              `export const ignored = ${JSON.stringify(`${mode}-helper`)};`,
              "export const upgradeManifests = source.upgradeManifests;",
              "",
            ].join("\n"),
          ),
        ),
        mkdir(subgraphsDirectory, { recursive: true }).then(() =>
          writeFile(
            resolve(subgraphsDirectory, "index.mjs"),
            [
              `import { ${subgraphExport} as Subgraph } from ${JSON.stringify(subgraphsUrl)};`,
              `export const LoaderSubgraph = { LoaderSubgraph: Subgraph, helper: ${JSON.stringify(`${mode}-helper`)} };`,
              `export const GenericAlias = { Subgraph, default: Subgraph, helper: ${JSON.stringify(`${mode}-generic-helper`)} };`,
              "",
            ].join("\n"),
          ),
        ),
      ];
    }),
  );
  return root;
}

async function nodeServerHost(
  runtimeFixtureRoot: string,
): Promise<LoaderHostResult> {
  return paired("node-server", async (mode) => {
    const runtimeRoot = resolve(runtimeFixtureRoot, mode);
    const loader = new ImportPackageLoader();
    const [models, manifests, subgraphs, documentModule, subgraphModule] =
      await Promise.all([
        loader.loadDocumentModels(runtimeRoot),
        loader.loadUpgradeManifests(runtimeRoot),
        loader.loadSubgraphs(runtimeRoot),
        import(
          pathToFileURL(
            resolve(runtimeRoot, "dist/node/document-models/index.mjs"),
          ).href
        ) as Promise<Record<string, unknown>>,
        import(
          pathToFileURL(resolve(runtimeRoot, "dist/node/subgraphs/index.mjs"))
            .href
        ) as Promise<Record<string, Record<string, unknown>>>,
      ]);
    return {
      importedNamespace: [
        ...flatNamespace(documentModule, "document-models."),
        ...nestedNamespace(subgraphModule, "subgraphs."),
      ].sort(compareCodeUnits),
      acceptedExports: [
        ...modelKeys(models),
        ...subgraphs.map((value) => `subgraph:${valueKind(value)}`),
        ...manifests.map(({ documentType }) => `manifest:${documentType}`),
      ],
      selectedNamedWorkerReference: null,
      diagnostics: [],
      registrationOutcome: `models=${models.length};subgraphs=${subgraphs.length};manifests=${manifests.length}`,
    };
  });
}

async function httpCdnHost(): Promise<LoaderHostResult> {
  return paired("http-cdn", (mode) => {
    const namespace = subgraphNamespace(mode);
    const subgraphs = extractSubgraphsFromModule(namespace as never);
    return Promise.resolve({
      importedNamespace: nestedNamespace(namespace),
      acceptedExports: subgraphs.map(() => "subgraph:function"),
      selectedNamedWorkerReference: null,
      diagnostics: [],
      registrationOutcome: `flattened=${subgraphs.length};non-callables=filtered`,
    });
  });
}

async function viteLocalHost(): Promise<LoaderHostResult> {
  return paired("vite-local", async (mode) => {
    const documents = documentNamespace(mode);
    const subgraphs = subgraphNamespace(mode);
    const vite = {
      ssrLoadModule(path: string) {
        return Promise.resolve(
          path.endsWith("/subgraphs") ? subgraphs : documents,
        );
      },
    };
    const loader = ReactorApiVitePackageLoader.build(vite as never);
    const [models, loadedSubgraphs] = await Promise.all([
      loader.loadDocumentModels("fixture", true),
      loader.loadSubgraphs("fixture"),
    ]);
    return {
      importedNamespace: [
        ...flatNamespace(documents, "document-models."),
        ...nestedNamespace(subgraphs, "subgraphs."),
      ].sort(compareCodeUnits),
      acceptedExports: [
        ...modelKeys(models),
        ...loadedSubgraphs.map(() => "subgraph:outer-name-match"),
      ],
      selectedNamedWorkerReference: null,
      diagnostics: [],
      registrationOutcome: `models=${models.length};subgraphs=${loadedSubgraphs.length}`,
    };
  });
}

function documentModelLib(mode: ModelMode): DocumentModelLib {
  return {
    manifest: {
      name: "loader-fixture",
      description: "B8 package-loader fixture",
    },
    documentModels: fixtureModels(mode),
    editors: [],
    subgraphs: [fixtureSubgraph(mode)] as never,
    upgradeManifests: fixtureManifests(mode),
  } as unknown as DocumentModelLib;
}

async function browserStaticHost(): Promise<LoaderHostResult> {
  return paired("browser-static", async (mode) => {
    const pkg = documentModelLib(mode);
    const manager = new StaticPackageManager([pkg]);
    const selected = await manager.load(fixtureDocumentType);
    return {
      importedNamespace: flatNamespace(
        pkg as unknown as Record<string, unknown>,
      ),
      acceptedExports: modelKeys(pkg.documentModels),
      selectedNamedWorkerReference: null,
      diagnostics: [],
      registrationOutcome: `packages=${manager.packages.length};selected=${modelKey(selected as DocumentModelModule)}`,
    };
  });
}

async function browserWorkerHost(): Promise<LoaderHostResult> {
  return paired("browser-worker", async (mode) => {
    const namespace = documentNamespace(mode);
    const importedUrls: string[] = [];
    const loader = new WorkerPackageLoader({
      cdnUrl: "https://registry.example/-/cdn",
      importPackage(url) {
        importedUrls.push(url);
        return Promise.resolve(namespace);
      },
      resolvePackages: () => Promise.resolve(["@fixture/loader@1.0.0"]),
    });
    const models = await loader.loadPackages(["@fixture/loader@1.0.0"]);
    const selected = await loader.load(fixtureDocumentType);
    return {
      importedNamespace: flatNamespace(namespace),
      acceptedExports: modelKeys(models),
      selectedNamedWorkerReference: null,
      diagnostics: loader.loadFailures.map(({ error }) => String(error)),
      registrationOutcome: `imports=${importedUrls.length};selected=${modelKey(selected)}`,
    };
  });
}

async function graphqlHost(): Promise<LoaderHostResult> {
  return paired("graphql", async (mode) => {
    const documents = documentNamespace(mode);
    const subgraphs = subgraphNamespace(mode);
    const models = [...fixtureModels(mode)];
    const Subgraph = fixtureSubgraph(mode);
    const loader: IPackageLoader = {
      name: "B8RecordingLoader",
      loadDocumentModels: () => Promise.resolve(models),
      loadUpgradeManifests: () => Promise.resolve([...fixtureManifests(mode)]),
      loadSubgraphs: () => Promise.resolve([Subgraph]),
      loadProcessors: () => Promise.resolve(null),
    };
    const result = await new PackageManager([loader], {
      packages: ["loader-fixture"],
    }).init();
    const accepted = result.documentModels.filter(
      (module) => module.documentModel.global.id === fixtureDocumentType,
    );
    const loadedSubgraphs = result.subgraphs.get("loader-fixture") ?? [];
    return {
      importedNamespace: [
        ...flatNamespace(documents, "document-models."),
        ...nestedNamespace(subgraphs, "subgraphs."),
      ].sort(compareCodeUnits),
      acceptedExports: [
        ...modelKeys(accepted),
        ...loadedSubgraphs.map(() => "subgraph:class"),
      ],
      selectedNamedWorkerReference: null,
      diagnostics: [],
      registrationOutcome: `models=${accepted.length};subgraphs=${loadedSubgraphs.length};manifests=${result.upgradeManifests.filter(({ documentType }) => documentType === fixtureDocumentType).length}`,
    };
  });
}

async function mcpHost(): Promise<LoaderHostResult> {
  return paired("mcp", async (mode) => {
    const source = mode === "legacy" ? "legacy-models.ts" : "source-models.ts";
    const namespace = (await import(
      pathToFileURL(resolve(fixtureRoot, source)).href
    )) as Record<string, unknown>;
    const loader = new McpVitePackageLoader(fixtureRoot, source);
    try {
      const models = await loader.load();
      return {
        importedNamespace: flatNamespace(namespace),
        acceptedExports: modelKeys(models),
        selectedNamedWorkerReference: null,
        diagnostics: [],
        registrationOutcome: `models=${models.length}`,
      };
    } finally {
      const server = (
        loader as unknown as {
          vite?: { close(): Promise<void> };
        }
      ).vite;
      await server?.close();
    }
  });
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
  };
}

async function connectHost(): Promise<LoaderHostResult> {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memoryStorage() },
  });
  try {
    const moduleUrl = pathToFileURL(
      resolve(repositoryRoot, "apps/connect/src/package-manager.ts"),
    ).href;
    const { BrowserPackageManager } = (await import(moduleUrl)) as {
      BrowserPackageManager: new (
        namespace: string,
        registryUrl: string | null,
      ) => {
        readonly packages: readonly DocumentModelLib[];
        addLocalPackage(
          name: string,
          pkg: DocumentModelLib,
          version?: string,
        ): void;
        load(documentType: string): Promise<DocumentModelModule>;
      };
    };
    return await paired("connect", async (mode) => {
      const pkg = documentModelLib(mode);
      const manager = new BrowserPackageManager(`b8-${mode}`, null);
      manager.addLocalPackage("loader-fixture", pkg, "1.0.0");
      const selected = await manager.load(fixtureDocumentType);
      return {
        importedNamespace: flatNamespace(
          pkg as unknown as Record<string, unknown>,
        ),
        acceptedExports: modelKeys(manager.packages[0]?.documentModels ?? []),
        selectedNamedWorkerReference: null,
        diagnostics: [],
        registrationOutcome: `packages=${manager.packages.length};selected=${modelKey(selected)}`,
      };
    });
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

async function reactorWorkerHost(): Promise<LoaderHostResult> {
  return paired("reactor-worker", async (mode) => {
    const sourceFile = resolve(
      fixtureRoot,
      mode === "legacy" ? "legacy-models.ts" : "source-models.ts",
    );
    const namespace = (await import(pathToFileURL(sourceFile).href)) as Record<
      string,
      unknown
    >;
    const resolved = await resolveModelSources([
      { filePath: sourceFile, exportName: "LoaderModelV1" },
      { filePath: sourceFile, exportName: "LoaderModelV2" },
    ]);
    const selectedEntry = resolved.manifest.find(
      ({ version }) => version === "2",
    );
    if (!selectedEntry) throw new Error("The v2 worker reference is missing.");
    const selected = (await defaultLoadFactory(
      selectedEntry.spec,
    )) as DocumentModelModule;
    return {
      importedNamespace: flatNamespace(namespace),
      acceptedExports: modelKeys(resolved.modules),
      selectedNamedWorkerReference: {
        specifier: "./models.ts",
        exportName: selectedEntry.spec.module.exportName,
      },
      diagnostics: [],
      registrationOutcome: `modules=${resolved.modules.length};manifest=${resolved.manifest.length};module-only=${resolved.moduleOnlyKeys.length};selected=${modelKey(selected)}`,
    };
  });
}

async function registryHost(): Promise<LoaderHostResult> {
  return paired("registry", (mode) => {
    const models = fixtureModels(mode);
    const registry = new DocumentModelRegistry();
    const outcomes = registry.registerModules(models[0], models[0]);
    const diagnostics = outcomes.flatMap((result) =>
      result.status === "error" ? [result.error.name] : [],
    );
    return Promise.resolve({
      importedNamespace: flatNamespace(documentNamespace(mode)),
      acceptedExports: modelKeys(registry.getAllModules()),
      selectedNamedWorkerReference: null,
      diagnostics,
      registrationOutcome: outcomes.map((result) => result.status).join(","),
    });
  });
}

export async function runLoaderCompatibilityCases(): Promise<LoaderCompatibilityProbeResult> {
  const runtimeFixtureRoot = await createRuntimeFixtureRoot();
  try {
    const definition = await definitionSourceHost();
    const hosts = [
      definition.host,
      await nodeServerHost(runtimeFixtureRoot),
      await httpCdnHost(),
      await viteLocalHost(),
      await browserStaticHost(),
      await browserWorkerHost(),
      await graphqlHost(),
      await mcpHost(),
      await connectHost(),
      await reactorWorkerHost(),
      await registryHost(),
    ];
    return { hosts, definitionSource: definition.source };
  } finally {
    await rm(runtimeFixtureRoot, { recursive: true, force: true });
  }
}
