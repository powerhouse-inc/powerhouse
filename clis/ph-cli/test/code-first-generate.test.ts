import { parse } from "cmd-ts";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateDocumentModelCmd } from "../src/commands/generate-document-model.js";
import { selectProjectModelGeneration } from "../src/services/definitions/authoring-mode.js";
import { startGenerateAll } from "../src/services/generate-all.js";
import { startGenerateDocumentModel } from "../src/services/generate-document-model.js";
import { startGenerateEditor } from "../src/services/generate-editor.js";
import type { GenerateDocumentModelArgs } from "../src/types.js";
import {
  createProject,
  printed,
  read,
  readJson,
  writeJson,
} from "./code-first-project.js";

const modelArgs = (
  overrides: Partial<GenerateDocumentModelArgs>,
): GenerateDocumentModelArgs => ({
  document: undefined,
  dir: undefined,
  all: false,
  extract: false,
  name: undefined,
  codeFirst: false,
  debug: undefined,
  ...overrides,
});

const editorArgs = {
  name: undefined,
  documentType: undefined,
  document: undefined,
  dir: undefined,
  all: true,
  extract: false,
  debug: undefined,
};

const projects: string[] = [];
afterAll(() => {
  for (const dir of projects) rmSync(dir, { recursive: true, force: true });
});

async function project(config: object = {}) {
  const dir = await createProject(config);
  projects.push(dir);
  return dir;
}

describe("ph generate document-model", () => {
  it("reads the --code-first flag and --name", async () => {
    const given = await parse(generateDocumentModelCmd, [
      "--code-first",
      "--name",
      "todo list",
    ]);
    const absent = await parse(generateDocumentModelCmd, []);
    expect(given._tag === "ok" && given.value).toMatchObject({
      codeFirst: true,
      name: "todo list",
    });
    expect(absent._tag === "ok" && absent.value).toMatchObject({
      codeFirst: false,
      name: undefined,
    });
  });
});

describe("the authoring switch", () => {
  const schemaFirst = { formatVersion: 1, mode: "schema-first" };
  const codeFirst = { formatVersion: 1, mode: "code-first", entries: [] };

  it.each([
    {
      name: "absent config: the default",
      config: {},
      flag: false,
      mode: "schema-first",
    },
    {
      name: "explicit schema-first",
      config: { definitionSources: schemaFirst },
      flag: false,
      mode: "schema-first",
    },
    {
      name: "code-first config",
      config: { definitionSources: codeFirst },
      flag: false,
      mode: "code-first",
    },
    {
      name: "the flag over schema-first config",
      config: { definitionSources: schemaFirst },
      flag: true,
      mode: "code-first",
    },
    {
      name: "the flag over an invalid config",
      config: { definitionSources: "code-first" },
      flag: true,
      mode: "code-first",
    },
  ])("$name selects $mode", ({ config, flag, mode }) => {
    const dir = mkdtempSync(join(tmpdir(), "ph-cli-mode-"));
    projects.push(dir);
    writeJson(dir, "powerhouse.config.json", config);
    expect(selectProjectModelGeneration(dir, flag).mode).toBe(mode);
  });

  it("refuses an invalid definitionSources without the flag", () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-cli-mode-"));
    projects.push(dir);
    writeJson(dir, "powerhouse.config.json", {
      definitionSources: "code-first",
    });
    expect(() => selectProjectModelGeneration(dir)).toThrow(
      'powerhouse.config.json has an invalid definitionSources (received "code-first")',
    );
  });
});

describe("--code-first --name in a package without definitionSources", () => {
  let dir: string;
  let output: string[];

  beforeAll(async () => {
    dir = await project();
    output = await printed(() =>
      startGenerateDocumentModel(
        modelArgs({ codeFirst: true, name: " todo list " }),
        dir,
      ),
    );
  }, 120_000);

  it("prints what it wrote, the registration and the editor", () => {
    const model = "document-models/todo-list";
    expect(output).toEqual([
      `Wrote ${model}/v1/definition.ts`,
      `Wrote ${model}/v1/modules/items.ts`,
      `Wrote ${model}/v1/index.ts`,
      `Wrote ${model}/v1/tests/document-model.test.ts`,
      `Wrote ${model}/v1/tests/items.test.ts`,
      `Wrote ${model}/upgrades/index.ts`,
      `Wrote ${model}/index.ts`,
      "Wrote powerhouse.config.json",
      "Wrote document-models/index.ts",
      "Wrote document-models/document-models.ts",
      "Wrote document-models/upgrade-manifests.ts",
      "Wrote powerhouse.manifest.json",
      "Registered acme-things/todo-list in powerhouse.config.json definitionSources (created)",
      'Generated editor "Todo List Editor" in editors/todo-list-editor',
    ]);
  });

  it("registers the model and lists it with its editor in the manifest", () => {
    expect(readJson(dir, "powerhouse.config.json")).toEqual({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./document-models/todo-list/index.ts" }],
      },
    });
    expect(readJson(dir, "powerhouse.manifest.json")).toMatchObject({
      documentModels: [{ id: "acme-things/todo-list", name: "Todo List" }],
      editors: [{ id: "todo-list-editor", name: "Todo List Editor" }],
    });
    expect(read(dir, "editors/todo-list-editor/module.ts")).toContain(
      '"acme-things/todo-list"',
    );
    expect(read(dir, "editors/editors.ts")).toContain("todo-list-editor");
  });

  it("keeps the model and editor when everything regenerates, from the config alone", async () => {
    const files = [
      "document-models/index.ts",
      "document-models/document-models.ts",
      "document-models/upgrade-manifests.ts",
      "editors/editors.ts",
      "editors/todo-list-editor/editor.tsx",
      "editors/todo-list-editor/module.ts",
    ];
    const before = files.map((path) => read(dir, path));
    expect(before[1]).toContain("TodoList");

    await printed(() => startGenerateAll({}, dir));

    expect(files.map((path) => read(dir, path))).toEqual(before);
  }, 120_000);

  it("reports the code-first model and editor when each kind regenerates", async () => {
    expect(
      await printed(() =>
        startGenerateDocumentModel(modelArgs({ all: true }), dir),
      ),
    ).toEqual(['Updated the exports of code-first document model "Todo List"']);
    expect(await printed(() => startGenerateEditor(editorArgs, dir))).toEqual([
      'Regenerated editor "Todo List Editor" in editors/todo-list-editor',
    ]);
  }, 120_000);

  it("refuses the same --name again without the flag, before writing", async () => {
    const config = read(dir, "powerhouse.config.json");
    await expect(
      startGenerateDocumentModel(modelArgs({ name: "todo list" }), dir),
    ).rejects.toThrow("editors/todo-list-editor already exists");
    expect(read(dir, "powerhouse.config.json")).toBe(config);
  });
});

describe("a schema-first package", () => {
  const schemaFirst = { formatVersion: 1, mode: "schema-first" };
  let dir: string;

  beforeAll(async () => {
    dir = await project({ definitionSources: schemaFirst });
  });

  it("refuses --name without code-first and writes nothing", async () => {
    await expect(
      startGenerateDocumentModel(modelArgs({ name: "todo" }), dir),
    ).rejects.toThrow(
      "--name creates a code-first document model. Pass --code-first.",
    );
    expect(readJson(dir, "powerhouse.config.json")).toEqual({
      definitionSources: schemaFirst,
    });
    expect(existsSync(join(dir, "document-models", "todo"))).toBe(false);
  });

  it("refuses --name with another generation mode", async () => {
    await expect(
      startGenerateDocumentModel(
        modelArgs({ codeFirst: true, name: "todo", all: true }),
        dir,
      ),
    ).rejects.toThrow(
      "Cannot specify multiple generation mode options. You provided: --name, --all",
    );
  });

  it("prints the usage line without reading definitionSources", async () => {
    writeJson(dir, "powerhouse.config.json", { definitionSources: "invalid" });
    expect(
      await printed(() => startGenerateDocumentModel(modelArgs({}), dir)),
    ).toEqual([
      "Please specify one of `document`, `dir`, `all`, or `extract`.",
    ]);
  });
});

it("refuses malformed config rather than falling back to schema-first", async () => {
  const dir = await createProject();
  try {
    writeFileSync(
      join(dir, "powerhouse.config.json"),
      '{"definitionSources": {"mode":"code-first"},}',
    );
    expect(() => selectProjectModelGeneration(dir)).toThrow(
      "powerhouse.config.json",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
