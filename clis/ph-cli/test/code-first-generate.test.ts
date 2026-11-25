import { parse } from "cmd-ts";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateDocumentModelCmd } from "../src/commands/generate-document-model.js";
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
  it("reads --name", async () => {
    const given = await parse(generateDocumentModelCmd, [
      "--name",
      "todo list",
    ]);
    const absent = await parse(generateDocumentModelCmd, []);
    expect(given._tag === "ok" && given.value).toMatchObject({
      name: "todo list",
    });
    expect(absent._tag === "ok" && absent.value).toMatchObject({
      name: undefined,
    });
  });

  it("rejects --code-first as an unknown argument", async () => {
    const result = await parse(generateDocumentModelCmd, [
      "--code-first",
      "--name",
      "todo list",
    ]);
    expect(result._tag === "error" && result.error.errors).toEqual([
      expect.objectContaining({
        message: "Unknown arguments",
        nodes: [expect.objectContaining({ raw: "--code-first" })],
      }),
    ]);
  });
});

describe("--name", () => {
  let dir: string;
  let output: string[];

  beforeAll(async () => {
    dir = await project();
    output = await printed(() =>
      startGenerateDocumentModel(modelArgs({ name: " todo list " }), dir),
    );
  }, 120_000);

  it("prints what it wrote and the editor", () => {
    const model = "document-models/todo-list";
    expect(output).toEqual([
      `Wrote ${model}/v1/definition.ts`,
      `Wrote ${model}/v1/modules/items.ts`,
      `Wrote ${model}/v1/index.ts`,
      `Wrote ${model}/v1/tests/document-model.test.ts`,
      `Wrote ${model}/v1/tests/items.test.ts`,
      `Wrote ${model}/upgrades/index.ts`,
      `Wrote ${model}/index.ts`,
      "Wrote document-models/index.ts",
      "Wrote document-models/document-models.ts",
      "Wrote document-models/upgrade-manifests.ts",
      "Wrote powerhouse.manifest.json",
      'Generated editor "Todo List Editor" in editors/todo-list-editor',
    ]);
  });

  it("leaves the config alone and lists the model with its editor in the manifest", () => {
    expect(readJson(dir, "powerhouse.config.json")).toEqual({});
    expect(readJson(dir, "powerhouse.manifest.json")).toMatchObject({
      documentModels: [{ id: "acme-things/todo-list", name: "Todo List" }],
      editors: [{ id: "todo-list-editor", name: "Todo List Editor" }],
    });
    expect(read(dir, "editors/todo-list-editor/module.ts")).toContain(
      '"acme-things/todo-list"',
    );
    expect(read(dir, "editors/editors.ts")).toContain("todo-list-editor");
  });

  it("keeps the model and editor when everything regenerates, from discovery alone", async () => {
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

  it("reports the model and editor when each kind regenerates", async () => {
    expect(
      await printed(() =>
        startGenerateDocumentModel(modelArgs({ all: true }), dir),
      ),
    ).toEqual(['Updated the exports of document model "Todo List"']);
    expect(await printed(() => startGenerateEditor(editorArgs, dir))).toEqual([
      'Regenerated editor "Todo List Editor" in editors/todo-list-editor',
    ]);
  }, 120_000);

  it("refuses the same --name again, before writing", async () => {
    const config = read(dir, "powerhouse.config.json");
    await expect(
      startGenerateDocumentModel(modelArgs({ name: "todo list" }), dir),
    ).rejects.toThrow("editors/todo-list-editor already exists");
    expect(read(dir, "powerhouse.config.json")).toBe(config);
  });
});

describe("a package without models", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await project();
  });

  it("refuses --name with another generation mode and writes nothing", async () => {
    await expect(
      startGenerateDocumentModel(modelArgs({ name: "todo", all: true }), dir),
    ).rejects.toThrow(
      "Cannot specify multiple generation mode options. You provided: --name, --all",
    );
    expect(readJson(dir, "powerhouse.config.json")).toEqual({});
    expect(existsSync(join(dir, "document-models", "todo"))).toBe(false);
  });

  it("prints the usage line without loading any model", async () => {
    writeJson(dir, "powerhouse.config.json", { documentModelsDir: 42 });
    expect(
      await printed(() => startGenerateDocumentModel(modelArgs({}), dir)),
    ).toEqual([
      "Please specify one of `name`, `document`, `dir`, `all`, or `extract`.",
    ]);
  });
});

it("refuses malformed config before generating anything", async () => {
  const dir = await createProject();
  try {
    writeFileSync(
      join(dir, "powerhouse.config.json"),
      '{"documentModelsDir": }',
    );
    const barrel = read(dir, "document-models/index.ts");
    await expect(
      startGenerateDocumentModel(modelArgs({ all: true }), dir),
    ).rejects.toThrow(/could not be loaded[\s\S]*parse-failed/);
    expect(read(dir, "document-models/index.ts")).toBe(barrel);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
