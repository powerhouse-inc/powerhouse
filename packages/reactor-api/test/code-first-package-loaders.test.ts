import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { inspectDocumentModelDefinition } from "document-model";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImportPackageLoader } from "../src/packages/import-loader.js";
import {
  startViteServer,
  VitePackageLoader,
} from "../src/packages/vite-loader.mjs";
import { DocumentModelSchemaCache } from "../src/utils/create-schema.js";
import {
  hostFor,
  messages,
  sortedSchema,
} from "./utils/document-model-host.js";

const CODE_FIRST = `import { defineDocumentModel, materialize, ph } from "document-model";

const counter = defineDocumentModel({
  id: "acme/counter",
  name: "Counter",
  description: "Counts.",
  extension: "counter",
  version: 1,
  author: { name: "Acme" },
  scopes: {
    global: {
      schema: ph.object("CounterState", { fields: { count: ph.Int({ required: true }) } }),
      initialValue: { count: 0 },
    },
    local: { schema: null, initialValue: {} },
  },
});

const counting = counter.module("counting", {
  operations: ({ global }) => ({
    increment: global({
      input: ph.input({ fields: { by: ph.Int({ required: true }) } }),
      reduce(state, input) {
        state.count += input.by;
      },
    }),
  }),
});

export const Counter = materialize(counter.version({ modules: [counting] }));
`;

const SCHEMA_FIRST = `export const Note = {
  documentModel: {
    global: {
      id: "acme/note",
      name: "Note",
      specifications: [
        {
          version: 1,
          state: {
            global: { schema: "type NoteState { text: String }", initialValue: "{}" },
            local: { schema: "", initialValue: "{}" },
          },
          modules: [
            {
              name: "editing",
              operations: [
                { name: "SET_TEXT", schema: "input SetTextInput { text: String }", scope: "global" },
              ],
            },
          ],
        },
      ],
    },
  },
  actions: { setText: (input) => ({ type: "SET_TEXT", input, scope: "global" }) },
};
`;

let root = "";

async function write(file: string, contents: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, contents);
}

async function packageDir(name: string, index: string): Promise<string> {
  const dir = join(root, name);
  await write(
    join(dir, "package.json"),
    JSON.stringify({ name: `@acme/${name}`, version: "1.0.0", type: "module" }),
  );
  await mkdir(join(dir, "node_modules"));
  for (const dependency of ["document-model", "zod"]) {
    await symlink(
      await realpath(
        resolve(import.meta.dirname, "../node_modules", dependency),
      ),
      join(dir, "node_modules", dependency),
      "junction",
    );
  }
  await write(join(dir, "document-models", "index.js"), index);
  return dir;
}

let mixedDir = "";

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "code-first-loaders-")));
  mixedDir = await packageDir("mixed", `${CODE_FIRST}\n${SCHEMA_FIRST}`);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const byType = (models: DocumentModelModule[]) =>
  new Map(models.map((model) => [model.documentModel.global.id, model]));

async function expectServes(models: DocumentModelModule[]) {
  const counter = byType(models).get("acme/counter")!;
  expect(inspectDocumentModelDefinition(counter).kind).toBe("structured");

  const resolved = new DocumentModelSchemaCache().resolve(models);
  expect(resolved.map(({ error }) => error)).toEqual(
    models.map(() => undefined),
  );

  const host = hostFor(counter);
  const result = await host.run(
    `mutation { Counter { increment(docId: "doc-1", input: { by: 3 }) { state { global { count } } } } }`,
  );
  expect(messages(result)).toEqual([]);
  expect(result.data).toEqual({
    Counter: { increment: { state: { global: { count: 3 } } } },
  });
  expect(sortedSchema(host.schema)).toContain(
    '  increment(docId: PHID @deprecated(reason: "Use documentIdOrSlug."), documentIdOrSlug: String, input: Counter_IncrementInput!): CounterMutationResult!',
  );
}

describe("ImportPackageLoader", () => {
  it("loads and serves a package that mixes schema-first and code-first models", async () => {
    const models = await new ImportPackageLoader().loadDocumentModels(mixedDir);
    expect(models.map((m) => m.documentModel.global.id)).toEqual([
      "acme/counter",
      "acme/note",
    ]);
    await expectServes(models);
    const note = byType(models).get("acme/note")!;
    expect(inspectDocumentModelDefinition(note)).toEqual({
      kind: "stored",
      reason: "absent",
    });
  });
});

describe("VitePackageLoader", () => {
  let vite: ViteDevServer;

  beforeAll(async () => {
    vite = await startViteServer(mixedDir);
  }, 60_000);

  afterAll(async () => {
    await vite.close();
  });

  it("loads and serves a package that mixes schema-first and code-first models", async () => {
    const models =
      await VitePackageLoader.build(vite).loadDocumentModels(mixedDir);
    expect(models.map((m) => m.documentModel.global.id)).toEqual([
      "acme/counter",
      "acme/note",
    ]);
    await expectServes(models);
  });
});
