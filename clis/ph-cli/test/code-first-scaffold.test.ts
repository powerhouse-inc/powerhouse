import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { vitestConfigTemplate } from "@powerhousedao/codegen/templates";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startGenerateDocumentModel } from "../src/services/generate-document-model.js";
import { startGenerateSubgraph } from "../src/services/generate-subgraph.js";
import { runModelCheck } from "../src/services/model-check.js";
import {
  runModelInspect,
  runSubgraphInspect,
} from "../src/services/model-inspect.js";
import { recordStreams } from "./helpers/streams.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, "..", "..", "..");

let projectDir: string;
let modelOutput: string[];

async function printed(generate: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  const enteredFrom = process.cwd();
  try {
    await generate();
  } finally {
    log.mockRestore();
    process.chdir(enteredFrom);
  }
  return lines;
}

function materializeProject(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "ph-scaffold-")));
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify(
      { name: "@acme/things", type: "module", private: true },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(root, "powerhouse.config.json"),
    `${JSON.stringify({ documentModelsDir: "./document-models" }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "nodenext",
          moduleResolution: "nodenext",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          types: [],
        },
        include: ["document-models/**/*.ts", "subgraphs/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  );

  const modules = join(root, "node_modules");
  mkdirSync(join(modules, "@powerhousedao"), { recursive: true });
  symlinkSync(
    join(REPOSITORY_ROOT, "packages", "document-model"),
    join(modules, "document-model"),
  );
  symlinkSync(
    join(REPOSITORY_ROOT, "packages", "shared"),
    join(modules, "@powerhousedao", "shared"),
  );
  symlinkSync(
    join(REPOSITORY_ROOT, "packages", "reactor-api"),
    join(modules, "@powerhousedao", "reactor-api"),
  );
  for (const dependency of [
    "typescript",
    "zod",
    "change-case",
    "mutative",
    "vitest",
  ]) {
    const source = join(REPOSITORY_ROOT, "node_modules", dependency);
    if (existsSync(source)) {
      symlinkSync(source, join(modules, dependency));
    }
  }
  mkdirSync(join(modules, "@vitest"));
  for (const dependency of ["@vitest/coverage-v8", "vite-tsconfig-paths"]) {
    symlinkSync(
      join(HERE, "..", "node_modules", dependency),
      join(modules, dependency),
    );
  }
  mkdirSync(join(modules, ".bin"), { recursive: true });
  const tsc = join(REPOSITORY_ROOT, "node_modules", ".bin", "tsc");
  if (existsSync(tsc)) symlinkSync(tsc, join(modules, ".bin", "tsc"));
  return root;
}

beforeAll(async () => {
  projectDir = materializeProject();
  modelOutput = await printed(() =>
    startGenerateDocumentModel(
      {
        document: undefined,
        dir: undefined,
        all: false,
        extract: false,
        codeFirst: " todo ",
        debug: undefined,
      },
      projectDir,
    ),
  );
});

afterAll(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("a scaffolded code-first model", () => {
  it("prints what it wrote and what to run next", () => {
    expect(modelOutput).toContain("Wrote document-models/todo/index.ts");
    expect(modelOutput.slice(-2)).toEqual([
      "Registered the model in powerhouse.config.json definitionSources (created)",
      "Next: ph model check",
    ]);
  });

  it("registers its source without a manual config edit", () => {
    const config = JSON.parse(
      readFileSync(join(projectDir, "powerhouse.config.json"), "utf8"),
    ) as { definitionSources?: unknown; documentModelsDir?: unknown };
    expect(config.definitionSources).toEqual({
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./document-models/todo/index.ts" }],
    });
    expect(config.documentModelsDir).toBe("./document-models");
  });

  it("passes ph model check", async () => {
    const recorded = recordStreams();
    const code = await runModelCheck(
      {
        configFile: join(projectDir, "powerhouse.config.json"),
        source: [],
        outDir: "dist",
        json: true,
        jsonLines: false,
        release: false,
        watch: false,
        warningsAsErrors: false,
        debug: undefined,
      },
      recorded,
    );
    const report = JSON.parse(recorded.stdout) as {
      status: string;
      diagnostics: readonly unknown[];
    };
    expect(report.diagnostics).toEqual([]);
    expect(report.status).toBe("ok");
    expect(code).toBe(0);
  }, 120_000);

  it("is re-exported from the package's document-model subpath", async () => {
    const subpath = (await import(
      /* @vite-ignore */
      join(projectDir, "document-models", "index.ts")
    )) as Record<string, unknown>;

    const named = subpath.todoV1 as
      | { documentModel: { global: { id: string } }; version: number }
      | undefined;
    expect(named?.documentModel.global.id).toBe("acme-things/todo");
    expect(named?.version).toBe(1);

    const collection = subpath.documentModels as readonly {
      documentModel: { global: { id: string } };
    }[];
    expect(collection.map((entry) => entry.documentModel.global.id)).toEqual([
      "acme-things/todo",
    ]);

    const manifests = subpath.upgradeManifests as readonly {
      documentType: string;
    }[];
    expect(manifests.map((entry) => entry.documentType)).toEqual([
      "acme-things/todo",
    ]);
  });

  it("compiles the model it wrote, and the module behaves", async () => {
    const model = (await import(
      /* @vite-ignore */
      join(projectDir, "document-models", "todo", "index.ts")
    )) as {
      documentModels: readonly {
        reducer: (document: unknown, action: unknown) => unknown;
        actions: Record<string, (input: unknown) => unknown>;
        utils: { createDocument: () => unknown };
        documentModel: { global: { id: string } };
      }[];
      upgradeManifests: readonly { documentType: string }[];
      todoFamily: { upgradeManifest: unknown };
    };
    const upgrades = (await import(
      /* @vite-ignore */
      join(projectDir, "document-models", "todo", "upgrades", "index.ts")
    )) as { todoUpgradeManifest: unknown; supportedVersions: unknown };

    const [todo] = model.documentModels;
    expect(todo.documentModel.global.id).toBe("acme-things/todo");
    expect(model.upgradeManifests[0].documentType).toBe("acme-things/todo");
    expect(model.todoFamily.upgradeManifest).toBe(upgrades.todoUpgradeManifest);
    expect(model.upgradeManifests[0]).toBe(upgrades.todoUpgradeManifest);
    expect(upgrades.supportedVersions).toEqual([1]);

    const document = todo.utils.createDocument();
    const next = todo.reducer(
      document,
      todo.actions.setTitle({ title: "First" }),
    ) as { state: { global: { title: string } } };
    expect(next.state.global.title).toBe("First");

    expect(() =>
      todo.actions.setTitle({ title: 12 as unknown as string }),
    ).toThrow();
  });

  it("typechecks under the project's own tsconfig", () => {
    const result = spawnSync(
      process.execPath,
      ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"],
      {
        cwd: projectDir,
        encoding: "utf8",
      },
    );
    expect(`${result.stdout}${result.stderr}`.trim()).toBe("");
    expect(result.status).toBe(0);
  }, 120_000);

  it("passes the tests it generated", () => {
    const result = spawnSync(
      process.execPath,
      [join(REPOSITORY_ROOT, "node_modules", "vitest", "vitest.mjs"), "run"],
      { cwd: projectDir, encoding: "utf8" },
    );
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  }, 120_000);

  it("meets the coverage threshold the project config enforces", () => {
    writeFileSync(join(projectDir, "vitest.config.ts"), vitestConfigTemplate);
    const result = spawnSync(
      process.execPath,
      [
        join(REPOSITORY_ROOT, "node_modules", "vitest", "vitest.mjs"),
        "run",
        "--coverage",
        "--coverage.reporter=json-summary",
      ],
      { cwd: projectDir, encoding: "utf8" },
    );
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);

    const summary = JSON.parse(
      readFileSync(
        join(projectDir, "coverage", "coverage-summary.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const measured = Object.keys(summary)
      .filter((key) => key !== "total")
      .map((file) => relative(projectDir, file));
    expect(measured).toEqual([
      join("document-models", "todo", "v1", "modules", "items.ts"),
    ]);
  }, 120_000);

  it("is refused a second time rather than overwritten", async () => {
    const edited = join(
      projectDir,
      "document-models",
      "todo",
      "v1",
      "definition.ts",
    );
    const before = readFileSync(edited, "utf8");
    await expect(
      printed(() =>
        startGenerateDocumentModel(
          {
            document: undefined,
            dir: undefined,
            all: false,
            extract: false,
            codeFirst: "todo",
            debug: undefined,
          },
          projectDir,
        ),
      ),
    ).rejects.toThrow("Refusing to overwrite");
    expect(readFileSync(edited, "utf8")).toBe(before);
  });
});

describe("adding version 2 to a scaffolded code-first model", () => {
  let versionedDir: string;
  const model = (...segments: string[]) =>
    join(versionedDir, "document-models", "todo", ...segments);
  const replaceIn = (file: string, from: string, to: string) => {
    const text = readFileSync(model(file), "utf8");
    expect(text).toContain(from);
    writeFileSync(model(file), text.replaceAll(from, to));
  };

  beforeAll(async () => {
    versionedDir = materializeProject();
    await printed(() =>
      startGenerateDocumentModel(
        {
          document: undefined,
          dir: undefined,
          all: false,
          extract: false,
          codeFirst: "todo",
          debug: undefined,
        },
        versionedDir,
      ),
    );
    cpSync(model("v1"), model("v2"), { recursive: true });
    replaceIn("v2/definition.ts", "version: 1,", "version: 2,");
    replaceIn("v2/index.ts", "todoV1Definition", "todoV2Definition");
    writeFileSync(
      model("upgrades", "v2.ts"),
      [
        'import type { UpgradeTransition } from "document-model";',
        "",
        "export const v2: UpgradeTransition = {",
        "  toVersion: 2,",
        "  upgradeReducer: (document) => document,",
        "};",
        "",
      ].join("\n"),
    );
    replaceIn("upgrades/versions.ts", "[1] as const", "[1, 2] as const");
    replaceIn(
      "upgrades/upgrade-manifest.ts",
      'from "./versions.js";',
      'from "./versions.js";\nimport { v2 } from "./v2.js";',
    );
    replaceIn(
      "upgrades/upgrade-manifest.ts",
      "upgrades: {},",
      "upgrades: { v2 },",
    );
    replaceIn(
      "index.ts",
      'import { todoV1Definition } from "./v1/index.js";',
      'import { todoV1Definition } from "./v1/index.js";\nimport { todoV2Definition } from "./v2/index.js";',
    );
    replaceIn(
      "index.ts",
      "versions: [todoV1Definition]",
      "versions: [todoV1Definition, todoV2Definition]",
    );
    replaceIn(
      "index.ts",
      "export const todoV1 = todoFamily.at(1);",
      "export const todoV1 = todoFamily.at(1);\nexport const todoV2 = todoFamily.at(2);",
    );
    replaceIn("index.ts", "[todoV1];", "[todoV1, todoV2];");
  });

  afterAll(() => {
    rmSync(versionedDir, { recursive: true, force: true });
  });

  it("makes version 2 the latest once supportedVersions lists it", async () => {
    const upgrades = (await import(
      /* @vite-ignore */
      model("upgrades", "index.ts")
    )) as { latestVersion: unknown };
    expect(upgrades.latestVersion).toBe(2);

    const typechecked = spawnSync(
      process.execPath,
      ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"],
      { cwd: versionedDir, encoding: "utf8" },
    );
    expect(`${typechecked.stdout}${typechecked.stderr}`.trim()).toBe("");
    expect(typechecked.status).toBe(0);

    const recorded = recordStreams();
    const code = await runModelCheck(
      {
        configFile: join(versionedDir, "powerhouse.config.json"),
        source: [],
        outDir: "dist",
        json: true,
        jsonLines: false,
        release: false,
        watch: false,
        warningsAsErrors: false,
        debug: undefined,
      },
      recorded,
    );
    const report = JSON.parse(recorded.stdout) as {
      diagnostics: readonly unknown[];
      definitions: readonly { key: string; version: number }[];
    };
    expect(report.diagnostics).toEqual([]);
    expect(
      report.definitions.map(({ key, version }) => ({ key, version })),
    ).toEqual([
      { key: "acme-things/todo", version: 1 },
      { key: "acme-things/todo", version: 2 },
    ]);
    expect(code).toBe(0);
  }, 120_000);
});

describe("a scaffolded code-first subgraph", () => {
  let subgraphOutput: string[];
  beforeAll(async () => {
    subgraphOutput = await printed(() =>
      startGenerateSubgraph(
        {
          name: " widgets ",
          document: undefined,
          dir: undefined,
          all: false,
          extract: false,
          codeFirst: true,
          skipInstall: true,
          debug: undefined,
        },
        projectDir,
      ),
    );
  });

  it("prints what it wrote and what to run next", () => {
    expect(subgraphOutput).toContain("Wrote subgraphs/widgets.ts");
    expect(subgraphOutput.slice(-2)).toEqual([
      "Registered the subgraph in powerhouse.config.json definitionSources (added)",
      "Next: ph model check",
    ]);
  });

  it("registers beside the model, not instead of it", () => {
    const config = JSON.parse(
      readFileSync(join(projectDir, "powerhouse.config.json"), "utf8"),
    ) as { definitionSources: { entries: { specifier: string }[] } };
    expect(config.definitionSources.entries.map((e) => e.specifier)).toEqual([
      "./document-models/todo/index.ts",
      "./subgraphs/widgets.ts",
    ]);
  });

  it("typechecks under the project's own tsconfig", () => {
    const result = spawnSync(
      process.execPath,
      ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"],
      { cwd: projectDir, encoding: "utf8" },
    );
    expect(`${result.stdout}${result.stderr}`.trim()).toBe("");
    expect(result.status).toBe(0);
  }, 180_000);

  it("passes ph model check, with the host validating its schema", async () => {
    const recorded = recordStreams();
    const code = await runModelCheck(
      {
        configFile: join(projectDir, "powerhouse.config.json"),
        source: [],
        outDir: "dist",
        json: true,
        jsonLines: false,
        release: false,
        watch: false,
        warningsAsErrors: false,
        debug: undefined,
      },
      recorded,
    );
    const report = JSON.parse(recorded.stdout) as {
      status: string;
      diagnostics: readonly { code: string }[];
      definitions: readonly { kind: string; key: string }[];
    };
    expect(report.diagnostics).toEqual([]);
    expect(report.status).toBe("ok");
    expect(code).toBe(0);
    expect(
      report.definitions.map((entry) => `${entry.kind}:${entry.key}`).sort(),
    ).toEqual(["document-model:acme-things/todo", "subgraph:widgets"]);
  }, 180_000);

  it("can be inspected, and so can a model beside it", async () => {
    const subgraphStreams = recordStreams();
    const subgraphCode = await runSubgraphInspect(
      {
        selector: "widgets",
        configFile: join(projectDir, "powerhouse.config.json"),
        source: [],
        json: true,
        debug: undefined,
      },
      subgraphStreams,
    );
    const subgraph = JSON.parse(subgraphStreams.stdout) as {
      status: string;
      definition?: { name: string; schemaKind: string };
      diagnostics?: readonly { code: string }[];
    };
    expect(subgraph.diagnostics ?? []).toEqual([]);
    expect(subgraph.status).toBe("ok");
    expect(subgraph.definition?.name).toBe("widgets");
    expect(subgraphCode).toBe(0);

    const modelStreams = recordStreams();
    const modelCode = await runModelInspect(
      {
        selector: "acme-things/todo@1",
        configFile: join(projectDir, "powerhouse.config.json"),
        source: [],
        json: true,
        debug: undefined,
      },
      modelStreams,
    );
    const model = JSON.parse(modelStreams.stdout) as {
      status: string;
      definition?: { model: { documentType: string } };
    };
    expect(model.status).toBe("ok");
    expect(model.definition?.model.documentType).toBe("acme-things/todo");
    expect(modelCode).toBe(0);
  }, 180_000);
});

describe("generate document-model with --all and --extract", () => {
  it("extracts, because only --code-first is exclusive with the other modes", async () => {
    const root = realpathSync.native(
      mkdtempSync(join(tmpdir(), "ph-extract-")),
    );
    try {
      writeFileSync(
        join(root, "package.json"),
        `${JSON.stringify({ name: "@acme/notes", type: "module" })}\n`,
      );
      writeFileSync(join(root, "tsconfig.json"), "{}\n");
      mkdirSync(join(root, "document-models", "notes"), { recursive: true });
      writeFileSync(
        join(root, "document-models", "notes", "notes.json"),
        JSON.stringify({
          ...documentModelDocumentModelModule.utils.createState().global,
          id: "acme/notes",
          name: "Notes",
        }),
      );
      const output = await printed(() =>
        startGenerateDocumentModel(
          {
            document: undefined,
            dir: undefined,
            all: true,
            extract: true,
            codeFirst: undefined,
            debug: undefined,
          },
          root,
        ),
      );
      expect(output).toEqual([
        `Wrote ${join(root, "specs", "document-models", "notes.phdm.phd")}`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("code-first generation refuses", () => {
  const noMode = {
    document: undefined,
    dir: undefined,
    all: false,
    extract: false,
    debug: undefined,
  };

  it("a blank model name", async () => {
    await expect(
      printed(() =>
        startGenerateDocumentModel({ ...noMode, codeFirst: "  " }, projectDir),
      ),
    ).rejects.toThrow("--code-first needs a model name.");
  });

  it("a second generation mode", async () => {
    await expect(
      printed(() =>
        startGenerateDocumentModel(
          { ...noMode, all: true, codeFirst: "notes" },
          projectDir,
        ),
      ),
    ).rejects.toThrow(
      "Cannot specify multiple generation mode options. You provided: --code-first, --all",
    );
  });

  it("a package without a name to namespace the document type", async () => {
    const root = realpathSync.native(
      mkdtempSync(join(tmpdir(), "ph-unnamed-")),
    );
    try {
      writeFileSync(join(root, "package.json"), "{}\n");
      await expect(
        printed(() =>
          startGenerateDocumentModel({ ...noMode, codeFirst: "notes" }, root),
        ),
      ).rejects.toThrow(
        "--code-first namespaces the document type under the package name. Add a name to package.json.",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a subgraph without --name", async () => {
    await expect(
      printed(() =>
        startGenerateSubgraph(
          { ...noMode, name: undefined, codeFirst: true, skipInstall: true },
          projectDir,
        ),
      ),
    ).rejects.toThrow("--code-first needs --name.");
  });
});
