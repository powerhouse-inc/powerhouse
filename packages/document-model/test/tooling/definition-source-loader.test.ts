import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DefinitionSourceLoader,
  isCanonicalDefinitionSource,
  normalizeDefinitionSourceSpecifier,
  type TypeScriptSourceImportInterface,
} from "../../src/tooling/index.js";

const REVISION = `sha256:${"a".repeat(64)}` as `sha256:${string}`;
const created: string[] = [];

function createProject(config: unknown): {
  configFile: string;
  root: string;
} {
  const root = mkdtempSync(join(tmpdir(), "ph-definition-loader-"));
  created.push(root);
  mkdirSync(join(root, "src"));
  const configFile = join(root, "powerhouse.config.json");
  writeFileSync(configFile, JSON.stringify(config));
  return { configFile, root };
}

function addSource(root: string, relativePath: string): void {
  const path = join(root, ...relativePath.split("/"));
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "export {};\n");
}

function createImporter(
  implementation: TypeScriptSourceImportInterface["importModule"],
) {
  const importModule = vi.fn(implementation);
  return {
    adapter: { importModule } satisfies TypeScriptSourceImportInterface,
    importModule,
  };
}

afterEach(() => {
  while (created.length > 0) {
    const directory = created.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("DefinitionSourceLoader", () => {
  it("rejects control characters and non-NFC source identity text", () => {
    for (const specifier of [
      "./src/model\n.ts",
      "./src/model\u0085.ts",
      "./src/cafe\u0301.ts",
    ]) {
      expect(() => normalizeDefinitionSourceSpecifier(specifier)).toThrow();
      expect(isCanonicalDefinitionSource({ specifier })).toBe(false);
    }
    expect(
      isCanonicalDefinitionSource({
        specifier: "./src/model.ts",
        exportPath: ["models", "unsafe\nname"],
      }),
    ).toBe(false);
    expect(
      isCanonicalDefinitionSource({
        specifier: "./src/model.ts",
        exportPath: ["cafe\u0301"],
      }),
    ).toBe(false);
  });

  it("lets CLI sources replace config sources and decodes RFC 6901 pointers", async () => {
    const { configFile, root } = createProject({
      definitionSources: { formatVersion: 999, ignored: true },
    });
    addSource(root, "src/z.ts");
    addSource(root, "src/A.ts");
    const { adapter } = createImporter(({ specifier }) =>
      Promise.resolve(
        specifier === "./src/z.ts"
          ? { nested: { "a/b": 42 } }
          : { selected: "namespace-root" },
      ),
    );

    const result = await new DefinitionSourceLoader(adapter).load({
      configFile,
      cliSources: ["./src/z.ts#/nested/a~1b", "./src/A.ts#"],
      packageRevision: REVISION,
    });

    expect(result.status).toBe("ready");
    expect(result.sourceSet.origin).toBe("cli");
    expect(result.sourceSet.sources).toEqual([
      { specifier: "./src/A.ts" },
      {
        specifier: "./src/z.ts",
        exportPath: ["nested", "a/b"],
      },
    ]);
    expect(result.values.map(({ value }) => value)).toEqual([
      { selected: "namespace-root" },
      42,
    ]);
  });

  it("imports one module once when distinct export paths select it", async () => {
    const { configFile, root } = createProject({});
    addSource(root, "src/models.ts");
    const { adapter, importModule } = createImporter(() =>
      Promise.resolve({
        one: { id: 1 },
        two: { id: 2 },
      }),
    );
    const loader = new DefinitionSourceLoader(adapter);

    const result = await loader.load({
      configFile,
      cliSources: ["./src/models.ts#/two", "./src/models.ts#/one"],
      packageRevision: REVISION,
    });

    expect(result.status).toBe("ready");
    expect(importModule).toHaveBeenCalledTimes(1);
    expect(result.values.map(({ value }) => value)).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });

  it("does not share an abort-bound import between independent loads", async () => {
    const { configFile, root } = createProject({});
    addSource(root, "src/model.ts");
    const resolvers: Array<
      (namespace: Readonly<Record<string, unknown>>) => void
    > = [];
    const { adapter, importModule } = createImporter(
      ({ signal }) =>
        new Promise<Readonly<Record<string, unknown>>>((resolve, reject) => {
          resolvers.push(resolve);
          signal?.addEventListener(
            "abort",
            () => {
              const reason: unknown = signal.reason;
              reject(
                reason instanceof Error
                  ? reason
                  : new DOMException(
                      "The operation was aborted.",
                      "AbortError",
                    ),
              );
            },
            { once: true },
          );
        }),
    );
    const loader = new DefinitionSourceLoader(adapter);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = loader.load({
      configFile,
      cliSources: ["./src/model.ts"],
      packageRevision: REVISION,
      signal: firstController.signal,
    });
    const second = loader.load({
      configFile,
      cliSources: ["./src/model.ts"],
      packageRevision: REVISION,
      signal: secondController.signal,
    });

    expect(importModule).toHaveBeenCalledTimes(2);
    firstController.abort(new DOMException("first cancelled", "AbortError"));
    resolvers[1]?.({ model: "loaded" });

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).resolves.toMatchObject({
      status: "ready",
      values: [
        { source: { specifier: "./src/model.ts" }, value: { model: "loaded" } },
      ],
    });
  });

  it("returns the closed skipped selection for explicit legacy mode", () => {
    const { configFile } = createProject({
      definitionSources: { formatVersion: 1, mode: "legacy" },
    });
    const { adapter, importModule } = createImporter(() => Promise.resolve({}));

    const result = new DefinitionSourceLoader(adapter).resolve({ configFile });

    expect(result).toMatchObject({
      status: "skipped",
      diagnostics: [],
      sourceSet: {
        mode: "legacy",
        origin: "config",
        sources: [],
      },
    });
    expect(result.sourceSet.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(importModule).not.toHaveBeenCalled();
  });

  it("reports a missing definitionSources field without scanning the source tree", () => {
    const { configFile, root } = createProject({});
    addSource(root, "src/decoy.ts");
    const { adapter, importModule } = createImporter(() =>
      Promise.resolve({ decoy: true }),
    );

    const result = new DefinitionSourceLoader(adapter).resolve({ configFile });

    expect(result.status).toBe("failed");
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "PH-CONFIG-SOURCES-MISSING",
    ]);
    expect(importModule).not.toHaveBeenCalled();
  });

  it("uses fixed code-unit ordering and a source-set digest independent of config order", () => {
    const first = createProject({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/z.ts" }, { specifier: "./src/A.ts" }],
      },
    });
    const second = createProject({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/A.ts" }, { specifier: "./src/z.ts" }],
      },
    });
    for (const project of [first, second]) {
      addSource(project.root, "src/A.ts");
      addSource(project.root, "src/z.ts");
    }
    const { adapter } = createImporter(() => Promise.resolve({}));
    const loader = new DefinitionSourceLoader(adapter);

    const firstResult = loader.resolve({ configFile: first.configFile });
    const secondResult = loader.resolve({ configFile: second.configFile });

    expect(firstResult.sourceSet.sources).toEqual([
      { specifier: "./src/A.ts" },
      { specifier: "./src/z.ts" },
    ]);
    expect(firstResult.sourceSet.digest).toBe(secondResult.sourceSet.digest);
  });

  it("detects duplicate source identity through an in-package symlink", () => {
    const { configFile, root } = createProject({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [
          { specifier: "./src/model.ts", exportPath: ["model"] },
          { specifier: "./src/alias.ts", exportPath: ["model"] },
        ],
      },
    });
    addSource(root, "src/model.ts");
    symlinkSync(join(root, "src/model.ts"), join(root, "src/alias.ts"));
    const { adapter } = createImporter(() => Promise.resolve({ model: {} }));

    const result = new DefinitionSourceLoader(adapter).resolve({ configFile });

    expect(result.status).toBe("failed");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "PH-CONFIG-DUPLICATE-SOURCE",
      path: ["definitionSources", "entries", 1],
      related: [
        {
          path: ["definitionSources", "entries", 0],
        },
      ],
    });
  });

  it("rejects lexical and symlink escapes from the package root", () => {
    const lexical = createProject({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./../outside.ts" }],
      },
    });
    const externalRoot = mkdtempSync(join(tmpdir(), "ph-definition-external-"));
    created.push(externalRoot);
    const externalSource = join(externalRoot, "outside.ts");
    writeFileSync(externalSource, "export {};\n");
    const linked = createProject({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/outside.ts" }],
      },
    });
    symlinkSync(externalSource, join(linked.root, "src/outside.ts"));
    const { adapter } = createImporter(() => Promise.resolve({}));
    const loader = new DefinitionSourceLoader(adapter);

    for (const configFile of [lexical.configFile, linked.configFile]) {
      const result = loader.resolve({ configFile });
      expect(result.status).toBe("failed");
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
      ]);
    }
  });

  it("reports an invalid CLI pointer at its exact option position", () => {
    const { configFile } = createProject({});
    const { adapter } = createImporter(() => Promise.resolve({}));

    const result = new DefinitionSourceLoader(adapter).resolve({
      configFile,
      cliSources: ["./src/ok.ts", "./src/bad.ts#not-a-pointer"],
    });

    expect(result.status).toBe("failed");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "PH-CONFIG-SOURCE-INVALID",
        path: ["sources", 1],
      }),
    ]);
  });

  it("preserves structured definition diagnostics thrown during import", async () => {
    const { configFile, root } = createProject({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/broken.ts" }],
      },
    });
    addSource(root, "src/broken.ts");
    const { adapter } = createImporter(() =>
      Promise.reject(
        Object.assign(new Error("Wrong root"), {
          name: "DocumentModelDefinitionError",
          diagnostics: [
            {
              code: "PH-DM-STATE-ROOT-INVALID",
              severity: "error",
              phase: "definition",
              definition: {
                kind: "document-model",
                key: "test/model",
                version: 1,
              },
              path: ["specifications", "global", "schema"],
              message: "Wrong root",
              repair: "Declare the canonical root.",
            },
          ],
        }),
      ),
    );

    const result = await new DefinitionSourceLoader(adapter).load({
      configFile,
      packageRevision: REVISION,
    });

    expect(result.status).toBe("failed");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "PH-DM-STATE-ROOT-INVALID",
        phase: "definition",
        source: { specifier: "./src/broken.ts" },
      }),
    ]);
    expect(result.diagnostics[0]).toHaveProperty("definition.version", 1);
  });

  it.each([
    { code: "PH-invalid-code", path: [] },
    { code: "PH-VALID-CODE", path: [-1] },
    {
      code: "PH-VALID-CODE",
      path: [],
      definition: { kind: "document-model", key: "test/model", version: 0 },
    },
    { code: "PH-VALID-CODE", path: [], phase: 4 },
    { code: "PH-VALID-CODE", path: [], severity: "fatal" },
    { code: "PH-VALID-CODE", path: [], expected: 3 },
    { code: "PH-VALID-CODE", path: [], received: null },
  ])(
    "degrades malformed thrown diagnostics to an import failure",
    async (malformed) => {
      const { configFile, root } = createProject({});
      addSource(root, "src/broken.ts");
      const { adapter } = createImporter(() =>
        Promise.reject(
          Object.assign(new Error("Malformed diagnostic"), {
            diagnostics: [
              {
                ...malformed,
                message: "Wrong root",
                repair: "Declare the canonical root.",
              },
            ],
          }),
        ),
      );

      const result = await new DefinitionSourceLoader(adapter).load({
        configFile,
        cliSources: ["./src/broken.ts"],
        packageRevision: REVISION,
      });

      expect(result.status).toBe("failed");
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ code: "PH-IMPORT-FAILED", phase: "import" }),
      ]);
    },
  );

  it("does not treat an empty thrown diagnostic list as a successful import", async () => {
    const { configFile, root } = createProject({});
    addSource(root, "src/broken.ts");
    const { adapter } = createImporter(() =>
      Promise.reject(
        Object.assign(new Error("Malformed structured diagnostics"), {
          diagnostics: [],
        }),
      ),
    );

    const result = await new DefinitionSourceLoader(adapter).load({
      configFile,
      cliSources: ["./src/broken.ts"],
      packageRevision: REVISION,
    });

    expect(result.status).toBe("failed");
    expect(result.values).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "PH-IMPORT-FAILED", phase: "import" }),
    ]);
  });

  it("turns export-path proxy traps into an import diagnostic", async () => {
    const { configFile, root } = createProject({});
    addSource(root, "src/trapped.ts");
    const trapped = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("private trap details");
        },
      },
    );
    const { adapter } = createImporter(() => Promise.resolve(trapped));

    const result = await new DefinitionSourceLoader(adapter).load({
      configFile,
      cliSources: ["./src/trapped.ts#/value"],
      packageRevision: REVISION,
    });

    expect(result.status).toBe("failed");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "PH-IMPORT-FAILED",
        path: ["exportPath", 0],
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("private trap details");
  });

  it("keeps checking independent roots after one import fails", async () => {
    const { configFile, root } = createProject({});
    addSource(root, "src/bad.ts");
    addSource(root, "src/good.ts");
    const hostileError = new Error("private failure");
    hostileError.name = `Error\n${root}`;
    const { adapter } = createImporter(({ specifier }) => {
      if (specifier === "./src/bad.ts") {
        return Promise.reject(hostileError);
      }
      return Promise.resolve({ definition: "loaded" });
    });

    const result = await new DefinitionSourceLoader(adapter).load({
      configFile,
      cliSources: ["./src/bad.ts", "./src/good.ts#/definition"],
      packageRevision: REVISION,
    });

    expect(result.status).toBe("failed");
    expect(result.values).toEqual([
      {
        source: {
          specifier: "./src/good.ts",
          exportPath: ["definition"],
        },
        value: "loaded",
      },
    ]);
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "PH-IMPORT-FAILED",
    ]);
    expect(result.diagnostics[0]?.received).toBe("Error");
    expect(JSON.stringify(result)).not.toContain(root);
  });
});
