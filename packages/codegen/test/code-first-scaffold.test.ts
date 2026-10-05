import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateCodeFirstDocumentModel,
  generateCodeFirstSubgraph,
} from "../src/codegen/generate.js";
import {
  codeFirstModelImportSpecifiers,
  codeFirstModelDirectories,
} from "../src/file-builders/document-model/code-first-aggregates.js";
import { planDefinitionSourceRegistration } from "../src/file-builders/index.mts";
import { buildTsMorphProject, formatSafe } from "../src/utils/index.mts";

let projectDir: string;
let enteredFrom: string;

const configPath = () => join(projectDir, "powerhouse.config.json");

function writeConfig(value: unknown): void {
  writeFileSync(configPath(), `${JSON.stringify(value, null, 2)}\n`);
}

function readConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(configPath(), "utf8")) as Record<
    string,
    unknown
  >;
}

async function registerDefinitionSource(
  ...args: Parameters<typeof planDefinitionSourceRegistration>
) {
  const { registration, commit } = await planDefinitionSourceRegistration(
    ...args,
  );
  await commit();
  return registration;
}

function read(path: string): string {
  return readFileSync(join(projectDir, path), "utf8");
}

const todo = {
  name: "todo",
  documentType: "acme-things/todo",
  author: { name: "acme-things", website: null },
};

async function generateModel(args = todo) {
  const project = buildTsMorphProject(projectDir);
  const result = await generateCodeFirstDocumentModel(args, project);
  await project.save();
  return result;
}

async function generateSubgraph(name: string) {
  const project = buildTsMorphProject(projectDir);
  const result = await generateCodeFirstSubgraph(name, project);
  await project.save();
  return result;
}

beforeEach(() => {
  enteredFrom = process.cwd();
  projectDir = mkdtempSync(join(tmpdir(), "ph-code-first-"));
  mkdirSync(join(projectDir, "document-models"), { recursive: true });
  writeFileSync(
    join(projectDir, "package.json"),
    JSON.stringify({ name: "@acme/things", type: "module" }),
  );
  writeFileSync(
    join(projectDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "nodenext", moduleResolution: "nodenext" },
    }),
  );
  writeConfig({ documentModelsDir: "./document-models" });
});

afterEach(() => {
  process.chdir(enteredFrom);
  rmSync(projectDir, { recursive: true, force: true });
});

describe("registerDefinitionSource", () => {
  const source = { specifier: "./document-models/todo/index.ts" } as const;

  it("creates the field and keeps the other keys", async () => {
    expect(await registerDefinitionSource(projectDir, source)).toBe("created");
    expect(readConfig()).toStrictEqual({
      documentModelsDir: "./document-models",
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./document-models/todo/index.ts" }],
      },
    });
  });

  it("leaves the file untouched when the source is already listed", async () => {
    await registerDefinitionSource(projectDir, source);
    const before = readFileSync(configPath(), "utf8");
    expect(await registerDefinitionSource(projectDir, source)).toBe(
      "unchanged",
    );
    expect(readFileSync(configPath(), "utf8")).toBe(before);
  });

  it("appends after existing entries and writes them back as read", async () => {
    writeConfig({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [
          { exportPath: ["ledger"], specifier: "./document-models/ledger.ts" },
        ],
      },
    });
    expect(await registerDefinitionSource(projectDir, source)).toBe("added");
    expect(readConfig().definitionSources).toStrictEqual({
      formatVersion: 1,
      mode: "code-first",
      entries: [
        { exportPath: ["ledger"], specifier: "./document-models/ledger.ts" },
        { specifier: "./document-models/todo/index.ts" },
      ],
    });
    expect(read("powerhouse.config.json")).toContain(
      '"exportPath": [\n          "ledger"\n        ],\n        "specifier"',
    );
  });

  it("fills an empty code-first entry list", async () => {
    writeConfig({
      definitionSources: { formatVersion: 1, mode: "code-first", entries: [] },
    });
    expect(await registerDefinitionSource(projectDir, source)).toBe("added");
    expect(readConfig().definitionSources).toStrictEqual({
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./document-models/todo/index.ts" }],
    });
  });

  it("converts an explicit schema-first selection", async () => {
    writeConfig({
      definitionSources: { formatVersion: 1, mode: "schema-first" },
    });
    expect(await registerDefinitionSource(projectDir, source)).toBe(
      "converted",
    );
    expect(readConfig().definitionSources).toStrictEqual({
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./document-models/todo/index.ts" }],
    });
  });

  it("keeps the file's indentation", async () => {
    writeFileSync(configPath(), `${JSON.stringify({ a: 1 }, null, 4)}\n`);
    await registerDefinitionSource(projectDir, source);
    expect(read("powerhouse.config.json")).toBe(
      `${JSON.stringify(
        {
          a: 1,
          definitionSources: {
            formatVersion: 1,
            mode: "code-first",
            entries: [{ specifier: "./document-models/todo/index.ts" }],
          },
        },
        null,
        4,
      )}\n`,
    );
  });

  it.each([
    ["a malformed file", "{ not json", /JSON/],
    [
      "an unsupported format version",
      JSON.stringify({
        definitionSources: { formatVersion: 2, mode: "code-first" },
      }),
      /formatVersion 2/,
    ],
    [
      "an unknown mode",
      JSON.stringify({
        definitionSources: { formatVersion: 1, mode: "typescript" },
      }),
      /definitionSources\.mode/,
    ],
    [
      "an entry the loader would reject",
      JSON.stringify({
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [{ specifier: "document-models/a.ts" }, 42],
        },
      }),
      /PH-CONFIG-SOURCE-INVALID/,
    ],
  ])("refuses %s and leaves it untouched", async (_, contents, message) => {
    writeFileSync(configPath(), contents);
    await expect(registerDefinitionSource(projectDir, source)).rejects.toThrow(
      message,
    );
    expect(readFileSync(configPath(), "utf8")).toBe(contents);
  });
});

describe("generateCodeFirstDocumentModel", () => {
  it("writes the model, registers it, and exports it from the package", async () => {
    expect(await generateModel()).toStrictEqual({
      written: [
        "document-models/todo/v1/definition.ts",
        "document-models/todo/v1/modules/items.ts",
        "document-models/todo/v1/index.ts",
        "document-models/todo/v1/tests/document-model.test.ts",
        "document-models/todo/v1/tests/items.test.ts",
        "document-models/todo/upgrades/versions.ts",
        "document-models/todo/upgrades/upgrade-manifest.ts",
        "document-models/todo/upgrades/index.ts",
        "document-models/todo/index.ts",
      ],
      registration: "created",
    });
    expect(readConfig().definitionSources).toStrictEqual({
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./document-models/todo/index.ts" }],
    });
    expect(read("document-models/index.ts")).toContain(
      'export * from "./todo/index.js";',
    );
    expect(read("document-models/document-models.ts")).toContain(
      "...documentModelsCodeFirst0",
    );
    expect(read("document-models/upgrade-manifests.ts")).toContain(
      "...upgradeManifestsCodeFirst0",
    );
  });

  it("writes files the project formatter leaves unchanged", async () => {
    const { written } = await generateModel();
    for (const path of written) {
      expect(await formatSafe(read(path)), path).toBe(read(path));
    }
  });

  it("refuses an existing file without writing anything", async () => {
    mkdirSync(join(projectDir, "document-models", "todo"));
    writeFileSync(
      join(projectDir, "document-models/todo/index.ts"),
      "// mine\n",
    );
    const config = readFileSync(configPath(), "utf8");

    await expect(generateModel()).rejects.toThrow(
      "Refusing to overwrite document-models/todo/index.ts",
    );
    expect(readdirSync(join(projectDir, "document-models", "todo"))).toEqual([
      "index.ts",
    ]);
    expect(read("document-models/todo/index.ts")).toBe("// mine\n");
    expect(readFileSync(configPath(), "utf8")).toBe(config);
  });

  it("refuses a config it cannot merge without writing any model file", async () => {
    writeConfig({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "document-models/a.ts" }],
      },
    });
    await expect(generateModel()).rejects.toThrow(/PH-CONFIG-SOURCE-INVALID/);
    expect(existsSync(join(projectDir, "document-models", "todo"))).toBe(false);
  });

  it("leaves the config untouched when the model files cannot be written", async () => {
    writeFileSync(join(projectDir, "document-models", "todo"), "a file\n");
    const config = readFileSync(configPath(), "utf8");
    await expect(generateModel()).rejects.toThrow();
    expect(readFileSync(configPath(), "utf8")).toBe(config);
  });

  it("exports two models without an ambiguous star export", async () => {
    await generateModel();
    await generateModel({
      name: "notes",
      documentType: "acme-things/notes",
      author: todo.author,
    });
    const project = new Project({
      tsConfigFilePath: join(projectDir, "tsconfig.json"),
    });
    const ambiguous = project
      .getSourceFileOrThrow(join(projectDir, "document-models/index.ts"))
      .getPreEmitDiagnostics()
      .filter((diagnostic) => diagnostic.getCode() === 2308)
      .map((diagnostic) => diagnostic.getMessageText());
    expect(ambiguous).toStrictEqual([]);
    expect(read("document-models/index.ts")).toContain(
      'export { documentModels } from "./document-models.js";',
    );
  });
});

describe("code-first aggregate modules", () => {
  it("maps configured sources under document-models/ to aggregate specifiers", () => {
    writeConfig({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [
          { specifier: "./document-models/todo/index.ts" },
          { specifier: "./document-models/ledger/index.mts" },
          { specifier: "./src/elsewhere/model.ts" },
        ],
      },
    });
    expect(codeFirstModelImportSpecifiers(projectDir)).toStrictEqual([
      "./ledger/index.mjs",
      "./todo/index.js",
    ]);
  });

  it("finds nothing in a schema-first package", () => {
    writeConfig({
      definitionSources: { formatVersion: 1, mode: "schema-first" },
    });
    expect(codeFirstModelImportSpecifiers(projectDir)).toStrictEqual([]);
  });

  it("names the model directories the manifest scan skips", () => {
    expect(
      codeFirstModelDirectories([
        "./todo/index.js",
        "./ledger/index.js",
        "./loose.js",
      ]),
    ).toStrictEqual(new Set(["todo", "ledger"]));
  });
});

describe("generateCodeFirstSubgraph", () => {
  it("writes the declaration and exports it under its constant's name", async () => {
    expect(await generateSubgraph("widgets")).toStrictEqual({
      written: ["subgraphs/widgets.ts", "subgraphs/index.ts"],
      registration: "created",
    });
    expect(read("subgraphs/index.ts")).toBe(
      'export * as WidgetsSubgraph from "./widgets.js";\n',
    );
    expect(read("subgraphs/widgets.ts")).toContain(
      "export const WidgetsSubgraph = defineSubgraph({",
    );
    expect(readConfig().definitionSources).toStrictEqual({
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./subgraphs/widgets.ts" }],
    });
  });

  it("accepts a name whose file name ends in index", async () => {
    expect((await generateSubgraph("SearchIndex")).written).toStrictEqual([
      "subgraphs/search-index.ts",
      "subgraphs/index.ts",
    ]);
    expect(read("subgraphs/index.ts")).toBe(
      'export * as SearchIndexSubgraph from "./search-index.js";\n',
    );
  });

  it("keeps the exports already in subgraphs/index.ts and adds none twice", async () => {
    mkdirSync(join(projectDir, "subgraphs"));
    writeFileSync(
      join(projectDir, "subgraphs/index.ts"),
      "export * as ExistingSubgraph from './existing/index.js';\nexport * as WidgetsSubgraph from './widgets.js';\n",
    );
    await generateSubgraph("widgets");
    expect(read("subgraphs/index.ts")).toBe(
      'export * as ExistingSubgraph from "./existing/index.js";\nexport * as WidgetsSubgraph from "./widgets.js";\n',
    );
  });

  it("refuses to overwrite an edited declaration", async () => {
    await generateSubgraph("widgets");
    writeFileSync(join(projectDir, "subgraphs/widgets.ts"), "// mine\n");
    const config = readFileSync(configPath(), "utf8");
    await expect(generateSubgraph("widgets")).rejects.toThrow(
      "Refusing to overwrite subgraphs/widgets.ts",
    );
    expect(read("subgraphs/widgets.ts")).toBe("// mine\n");
    expect(readFileSync(configPath(), "utf8")).toBe(config);
  });

  it("leaves the config untouched when the declaration cannot be written", async () => {
    writeFileSync(join(projectDir, "subgraphs"), "a file\n");
    const config = readFileSync(configPath(), "utf8");
    await expect(generateSubgraph("widgets")).rejects.toThrow();
    expect(readFileSync(configPath(), "utf8")).toBe(config);
  });
});
