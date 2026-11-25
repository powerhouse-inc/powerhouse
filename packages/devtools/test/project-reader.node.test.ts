import type { ProjectCheck, ProjectSection } from "../src/project-types.js";
import {
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProjectReader,
  type ProjectReaderOptions,
} from "../src/server/project/reader.js";
import {
  createFixtureProject,
  type FixtureProject,
  NOTE_JSON,
} from "./project-reader.fixture.js";

const disposers: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
  delete evaluationsHolder.__phProjectReaderTest;
  vi.unstubAllEnvs();
});

/**
 * A reader that fingerprints the files on every call, so a test sees its own
 * edit at once, and whose clock stands still, so nothing is retried unless
 * the test moves it.
 */
const readerOf = (root: string, options: ProjectReaderOptions = {}) =>
  createProjectReader(root, { revisionTtlMs: 0, now: () => 0, ...options });

type Evaluations = {
  evaluations: number;
  running: number;
  mostRunning: number;
};

const evaluationsHolder = globalThis as { __phProjectReaderTest?: Evaluations };

/** What the `counting` modules recorded. The model loader evaluates them in this process. */
const evaluations = (): Evaluations =>
  evaluationsHolder.__phProjectReaderTest ?? {
    evaluations: 0,
    running: 0,
    mostRunning: 0,
  };

/**
 * A code-first entry that is no model: it counts its evaluations and how
 * many run at once. `body` runs while it counts as running.
 */
const counting = (body = "") => `
const counts = (globalThis.__phProjectReaderTest ??= { evaluations: 0, running: 0, mostRunning: 0 });
counts.evaluations += 1;
counts.running += 1;
counts.mostRunning = Math.max(counts.mostRunning, counts.running);
${body}
counts.running -= 1;
export {};
`;

async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("The condition never held.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const linkType = process.platform === "win32" ? "junction" : "dir";

function project(files?: Parameters<typeof createFixtureProject>[0]) {
  const created = createFixtureProject(files);
  disposers.push(created.dispose);
  return created;
}

function items<T>(section: ProjectSection<T>): T[] {
  if (!section.ok) throw new Error(`Section failed: ${section.message}`);
  return section.items;
}

function failure(section: ProjectSection<unknown>): string {
  if (section.ok) throw new Error("Section answered.");
  return section.message;
}

const check = (module: { checks: ProjectCheck[] }, id: ProjectCheck["id"]) =>
  module.checks.find((candidate) => candidate.id === id);

/** Every path below the project with its size and modification time. */
function fingerprint(root: string, dir = ""): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return [path, ...fingerprint(root, path)];
      const { size, mtimeMs } = statSync(join(root, path));
      return [`${path} ${size} ${mtimeMs}`];
    },
  );
}

type Note = {
  name: string;
  specifications: { state: { global: { schema: string } } }[];
};

/** Rewrites the fixture's stored model. */
function editNote({ read, write }: FixtureProject, edit: (note: Note) => void) {
  const note = JSON.parse(read(NOTE_JSON)) as Note;
  edit(note);
  write(NOTE_JSON, `${JSON.stringify(note, null, 2)}\n`);
}

describe("the project snapshot", () => {
  it("lists a stored document model with its counts and passing checks", async () => {
    const { root } = project();
    const snapshot = await readerOf(root).snapshot();

    expect(snapshot.root).toBe(root);
    expect(snapshot.diagnostics).toEqual([]);
    expect(items(snapshot.documentModels)).toEqual([
      {
        documentType: "fixture/note",
        name: "Note",
        extension: ".note",
        description: "A note with a title and tags.",
        author: "Fixture",
        authorWebsite: null,
        layout: "stored",
        source: NOTE_JSON,
        folder: "document-models/note",
        versions: [1],
        modules: 2,
        operations: 4,
        checks: [
          {
            id: "registered",
            state: "pass",
            label: "Registered in document-models/document-models.ts",
          },
          {
            id: "manifest",
            state: "pass",
            label: "Listed in powerhouse.manifest.json",
          },
          {
            id: "definition",
            state: "pass",
            label: "Definition passes the document model checks",
          },
        ],
      },
    ]);
  });

  it("separates drive apps from editors and reads an app's config", async () => {
    const { root } = project();
    const snapshot = await readerOf(root).snapshot();

    expect(
      items(snapshot.editors).map(({ id, name, folder, documentTypes }) => ({
        id,
        name,
        folder,
        documentTypes,
      })),
    ).toEqual([
      {
        id: "draft-editor",
        name: "Draft Editor",
        folder: "editors/draft-editor",
        documentTypes: ["fixture/ghost", "powerhouse/document-model"],
      },
      {
        id: "note-editor",
        name: "Note Editor",
        folder: "editors/note-editor",
        documentTypes: ["fixture/note"],
      },
    ]);
    expect(items(snapshot.apps)).toMatchObject([
      {
        id: "notes-app",
        name: "Notes",
        folder: "editors/notes-app",
        documentTypes: ["powerhouse/reactor-drive"],
        allowedDocumentTypes: ["fixture/note"],
        dragAndDrop: false,
      },
    ]);
  });

  it("answers null for the config of an app without config.ts", async () => {
    const { root } = project({ "editors/notes-app/config.ts": null });
    const [app] = items((await readerOf(root).snapshot()).apps);

    expect(app.allowedDocumentTypes).toBeNull();
    expect(app.dragAndDrop).toBeNull();
  });

  it.each([
    ["sets no allowed types", "export const editorConfig = {};\n", []],
    [
      "builds its allowed types at runtime",
      'const types = ["fixture/note"];\nexport const editorConfig = { allowedDocumentTypes: types };\n',
      null,
    ],
  ])("reads an app whose config %s", async (_what, config, allowed) => {
    const { root } = project({ "editors/notes-app/config.ts": config });
    const [app] = items((await readerOf(root).snapshot()).apps);

    expect(app.allowedDocumentTypes).toEqual(allowed);
    expect(check(app, "document-types")).toBeUndefined();
  });

  it("reports an editor whose module.ts does not spell its id as a literal", async () => {
    const { root } = project({
      "editors/computed/module.ts":
        'const id = "computed";\nexport const Computed = { documentTypes: ["fixture/note"], config: { id, name: "Computed" } };\n',
    });
    const snapshot = await readerOf(root).snapshot();

    expect(items(snapshot.editors).map(({ id }) => id)).toEqual([
      "draft-editor",
      "note-editor",
    ]);
    expect(snapshot.diagnostics).toEqual([
      {
        severity: "warning",
        message:
          "editors/computed/module.ts does not declare its id, name and documentTypes as literals, so the editor is not listed.",
        file: "editors/computed/module.ts",
      },
    ]);
  });

  it("warns about an editor that editors/editors.ts does not import", async () => {
    const { root } = project();
    const [draft, note] = items((await readerOf(root).snapshot()).editors);

    expect(check(note, "registered")).toEqual({
      id: "registered",
      state: "pass",
      label: "Registered in editors/editors.ts",
    });
    expect(check(draft, "registered")).toEqual({
      id: "registered",
      state: "warn",
      label: "Not registered in editors/editors.ts",
      detail:
        "The host does not load this editor. Run `ph generate editor --all` to register it.",
    });
  });

  it("warns about a manifest entry with an old name and a module the manifest lacks", async () => {
    const { root } = project();
    const snapshot = await readerOf(root).snapshot();
    const [draft, note] = items(snapshot.editors);
    const [processor] = items(snapshot.processors);

    expect(check(note, "manifest")).toMatchObject({
      state: "warn",
      label: "Listed in powerhouse.manifest.json as Note Viewer",
    });
    expect(check(draft, "manifest")).toEqual({
      id: "manifest",
      state: "warn",
      label: "Not listed in powerhouse.manifest.json",
      detail: "Run `ph generate editor --all` to add it.",
    });
    expect(check(processor, "manifest")).toMatchObject({
      state: "warn",
      label: "Not listed in powerhouse.manifest.json",
      detail: "Run `ph generate processor --all` to add it.",
    });
    expect(check(items(snapshot.apps)[0], "manifest")?.state).toBe("pass");
    expect(check(items(snapshot.subgraphs)[0], "manifest")?.state).toBe("pass");
  });

  it("warns about a document type that no model of the project has", async () => {
    const { root } = project();
    const snapshot = await readerOf(root).snapshot();
    const [draft, note] = items(snapshot.editors);

    expect(check(draft, "document-types")).toEqual({
      id: "document-types",
      state: "warn",
      label: "No model of type fixture/ghost in the project",
      detail: "Fine if an installed package provides it.",
    });
    expect(check(note, "document-types")?.state).toBe("pass");
    expect(check(items(snapshot.apps)[0], "document-types")?.state).toBe(
      "pass",
    );
    expect(check(items(snapshot.processors)[0], "document-types")?.state).toBe(
      "pass",
    );
  });

  it("reads a schema-first subgraph's SDL and flattens its namespaced fields", async () => {
    const { root } = project();
    const [subgraph] = items((await readerOf(root).snapshot()).subgraphs);

    expect(subgraph).toMatchObject({
      name: "note-stats",
      folder: "subgraphs/note-stats",
      style: "schema-first",
      queries: ["noteStats.count(driveId: String!): Int!", "version: String"],
      mutations: [
        "noteStats.reset(driveId: String!, hard: Boolean = false): Boolean",
      ],
    });
    expect(subgraph.schema?.file).toBe("subgraphs/note-stats/schema.ts");
    expect(subgraph.schema?.source).toMatch(
      /^type NoteStatsSubgraphQueries \{\n {2}count\(driveId: String!\): Int!\n\}/,
    );
    expect(check(subgraph, "registered")).toMatchObject({
      state: "pass",
      label: "Registered in subgraphs/index.ts",
    });
  });

  it("answers no schema for a code-first subgraph", async () => {
    const { root } = project({
      "subgraphs/typed/index.ts":
        'import { Subgraph } from "@powerhousedao/reactor-api";\nexport class TypedSubgraph extends Subgraph {\n  static subgraphName = "typed";\n}\n',
    });
    const [, typed] = items((await readerOf(root).snapshot()).subgraphs);

    expect(typed).toMatchObject({
      name: "typed",
      folder: "subgraphs/typed",
      style: "code-first",
      schema: null,
      queries: [],
      mutations: [],
    });
    expect(check(typed, "registered")?.label).toBe(
      "Not registered in subgraphs/index.ts",
    );
  });

  it("reads a processor's type from its imports and its hosts from the factory lists", async () => {
    const { root } = project({
      "processors/plain/processor.ts": "export class Plain {}\n",
      "processors/plain/factory.ts":
        "export const plainFactoryBuilder = () => () => [];\n",
      "processors/switchboard.ts":
        'import { plainFactoryBuilder } from "./plain/factory.js";\nimport { noteCounterFactoryBuilder } from "./note-counter/index.js";\nexport const processorFactoryBuilders = [plainFactoryBuilder, noteCounterFactoryBuilder];\n',
      "processors/orphan/processor.ts":
        'import { RelationalDbProcessor } from "./base.js";\nexport class Orphan extends RelationalDbProcessor {}\n',
    });
    const processors = items((await readerOf(root).snapshot()).processors);

    expect(
      processors.map(({ name, folder, type, apps, documentTypes }) => ({
        name,
        folder,
        type,
        apps,
        documentTypes,
      })),
    ).toEqual([
      {
        name: "note-counter",
        folder: "processors/note-counter",
        type: "analytics",
        apps: ["connect", "switchboard"],
        documentTypes: ["fixture/note"],
      },
      {
        name: "orphan",
        folder: "processors/orphan",
        type: "relationalDb",
        apps: [],
        documentTypes: [],
      },
      {
        name: "plain",
        folder: "processors/plain",
        type: null,
        apps: ["switchboard"],
        documentTypes: [],
      },
    ]);
    expect(
      processors.map((processor) => check(processor, "registered")),
    ).toEqual([
      {
        id: "registered",
        state: "pass",
        label:
          "Registered in processors/connect.ts and processors/switchboard.ts",
      },
      {
        id: "registered",
        state: "warn",
        label:
          "Not registered in processors/connect.ts or processors/switchboard.ts",
        detail:
          "The host does not load this processor. Run `ph generate processor --all` to register it.",
      },
      {
        id: "registered",
        state: "pass",
        label: "Registered in processors/switchboard.ts",
      },
    ]);
  });

  it("fails a model's definition check with its first error", async () => {
    const created = project();
    editNote(created, (note) => {
      note.specifications[0].state.global.schema =
        "type NoteState {\n  title: Missing!\n}";
    });
    const snapshot = await readerOf(created.root).snapshot();
    const [note] = items(snapshot.documentModels);
    const definition = check(note, "definition");

    expect(note.documentType).toBe("fixture/note");
    expect(definition?.state).toBe("fail");
    expect(definition?.label).toBe("Definition has 1 error");
    expect(definition?.detail).toContain("Missing");
    expect(snapshot.diagnostics).toEqual([]);
  });
});

describe("a section that cannot be read", () => {
  it("answers for the others when the config is not JSON", async () => {
    const { root } = project({ "powerhouse.config.json": "{ nope" });
    const snapshot = await readerOf(root).snapshot();

    const message = failure(snapshot.documentModels);
    expect(message).toContain("config file could not be read");
    expect(message).not.toContain(root);
    expect(items(snapshot.editors).map(({ id }) => id)).toEqual([
      "draft-editor",
      "note-editor",
    ]);
    expect(items(snapshot.apps)).toHaveLength(1);
    expect(items(snapshot.subgraphs)).toHaveLength(1);
    expect(items(snapshot.processors)).toHaveLength(1);
    // With no list of models, no type can be called missing.
    expect(check(items(snapshot.editors)[0], "document-types")).toBeUndefined();
  });

  it("answers for the models when tsconfig.json is missing", async () => {
    const { root } = project({ "tsconfig.json": null });
    const snapshot = await readerOf(root).snapshot();

    expect(items(snapshot.documentModels)).toHaveLength(1);
    for (const section of [
      snapshot.editors,
      snapshot.apps,
      snapshot.subgraphs,
      snapshot.processors,
    ]) {
      expect(failure(section)).toBe("File not found: ./tsconfig.json");
    }
  });

  it("reports a model whose JSON does not parse and keeps the other models", async () => {
    const { root } = project({
      "document-models/broken/broken.json": "{ nope",
    });
    const snapshot = await readerOf(root).snapshot();

    expect(
      items(snapshot.documentModels).map(({ documentType }) => documentType),
    ).toEqual(["fixture/note"]);
    expect(snapshot.diagnostics).toMatchObject([
      {
        severity: "error",
        file: "document-models/broken/broken.json",
        message: "The stored document model is not JSON.",
      },
    ]);
    expect(items(snapshot.editors)).toHaveLength(2);
  });
});

describe("one document model in full", () => {
  it("answers the specification with its state and operations", async () => {
    const { root } = project();
    const reader = readerOf(root);
    const detail = await reader.documentModel("fixture/note");

    expect(detail).toMatchObject({
      documentType: "fixture/note",
      revision: await reader.revision(),
    });
    const [specification] = detail!.specifications;
    expect(specification).toMatchObject({
      version: 1,
      changeLog: [],
      state: {
        global: { initialValue: '{"title":"","archived":false,"tags":[]}' },
        local: null,
      },
    });
    expect(specification.state.global.schema).toContain("type NoteState {");
    expect(specification.modules[0]).toMatchObject({
      id: "content",
      name: "content",
      description: "The note's text.",
    });
    expect(specification.modules[0].operations[0]).toMatchObject({
      id: "set-title",
      name: "SET_TITLE",
      scope: "global",
      description: "Sets the title.",
      schema: "input SetTitleInput {\n  title: String!\n}",
      errors: [
        {
          name: "EmptyTitle",
          code: "EMPTY_TITLE",
          description: "The title is empty.",
        },
      ],
      examples: ['{"title":"Hello"}'],
    });
  });

  it("answers undefined for a type the project has no model of", async () => {
    const { root } = project();

    expect(await readerOf(root).documentModel("fixture/ghost")).toBeUndefined();
  });
});

describe("the file list", () => {
  it("lists the files of every editor, drive app, subgraph and processor", async () => {
    const { root } = project();
    const reader = readerOf(root);
    const list = await reader.fileList();

    expect(list.revision).toBe(await reader.revision());
    expect(list.modules.map(({ folder }) => folder)).toEqual([
      "editors/draft-editor",
      "editors/note-editor",
      "editors/notes-app",
      "subgraphs/note-stats",
      "processors/note-counter",
    ]);
    const filesOf = (folder: string) =>
      list.modules.find((module) => module.folder === folder)?.files;
    expect(filesOf("editors/notes-app")).toEqual([
      { path: "editors/notes-app/config.ts" },
      { path: "editors/notes-app/module.ts" },
    ]);
    expect(filesOf("editors/note-editor")).toEqual([
      { path: "editors/note-editor/editor.ts" },
      { path: "editors/note-editor/module.ts" },
    ]);
  });
});

describe("files that hold secrets", () => {
  it("lists and answers none of them, wherever they are", async () => {
    const created = project({
      "editors/notes-app/.env": "SECRET=1\n",
      "editors/notes-app/.env.local": "SECRET=2\n",
      "editors/notes-app/certs/server.pem": "-----BEGIN-----\n",
      "editors/notes-app/certs/server.KEY": "-----BEGIN-----\n",
    });
    const reader = readerOf(created.root);
    const list = await reader.fileList();
    const paths = list.modules.flatMap(({ files }) =>
      files.map(({ path }) => path),
    );

    expect(paths.filter((path) => /env|certs/.test(path))).toEqual([]);
    expect(await reader.file("editors/notes-app/.env")).toBeUndefined();
    expect(
      await reader.file("editors/notes-app/certs/server.pem"),
    ).toBeUndefined();
  });
});

describe("one file's text", () => {
  it("answers a module's file", async () => {
    const created = project();
    const reader = readerOf(created.root);

    expect(await reader.file("editors/notes-app/module.ts")).toEqual({
      revision: await reader.revision(),
      path: "editors/notes-app/module.ts",
      text: created.read("editors/notes-app/module.ts"),
      truncated: false,
    });
  });

  it("answers no path that the file list does not list", async () => {
    const created = project();
    created.write("editors/notes.md", "outside any module\n");
    const reader = readerOf(created.root);
    for (const path of [
      "package.json",
      "tsconfig.json",
      "editors/notes.md",
      "editors/notes-app",
      "editors/notes-app/../notes-app/module.ts",
      "../outside.ts",
      join(created.root, "editors/notes-app/module.ts"),
      "",
    ]) {
      expect(await reader.file(path), path).toBeUndefined();
    }
  });

  it("lists no symlink to a dot-file, a key or a dot-folder", async () => {
    const created = project();
    created.write(".env", "SECRET=1\n");
    created.write("certs/server.key", "KEY\n");
    created.write(".secrets/api.json", "{}\n");
    const folder = join(created.root, "editors", "notes-app");
    symlinkSync(join(created.root, ".env"), join(folder, "settings"));
    symlinkSync(
      join(created.root, "certs", "server.key"),
      join(folder, "cert"),
    );
    symlinkSync(join(created.root, ".secrets"), join(folder, "conf"), linkType);
    const reader = readerOf(created.root);
    const files = (await reader.fileList()).modules
      .find((module) => module.folder === "editors/notes-app")
      ?.files.map(({ path }) => path);

    expect(files).toContain("editors/notes-app/module.ts");
    expect(
      files?.filter((path) =>
        /^editors\/notes-app\/(settings|cert|conf)(\/|$)/.test(path),
      ),
    ).toEqual([]);
    expect(await reader.file("editors/notes-app/settings")).toBeUndefined();
  });

  it("refuses a listed file that has become a symlink out of the project", async () => {
    const created = project();
    const path = "editors/notes-app/module.ts";
    const outside = mkdtempSync(join(tmpdir(), "ph-project-reader-outside-"));
    disposers.push(() => rmSync(outside, { recursive: true, force: true }));
    const secret = join(outside, "secret.ts");
    writeFileSync(secret, "export const secret = 1;\n");
    // The revision is reused for a while, so the read that lists the file
    // still answers after the file is replaced.
    const reader = readerOf(created.root, { revisionTtlMs: 60_000 });
    const revision = await reader.revision();
    expect((await reader.file(path))?.text).toBe(created.read(path));

    created.remove(path);
    symlinkSync(secret, join(created.root, path));

    expect(await reader.revision()).toBe(revision);
    expect(await reader.file(path)).toBeUndefined();
  });

  it("cuts a large file short where a character starts", async () => {
    const created = project();
    const path = "processors/note-counter/large.ts";
    // One byte, then two-byte characters: the limit falls inside one.
    created.write(path, `a${"é".repeat(200_000)}`);
    const read = await readerOf(created.root).file(path);

    expect(read?.truncated).toBe(true);
    expect(Buffer.byteLength(read?.text ?? "")).toBe(256 * 1024 - 1);
    expect(read?.text).toBe(`a${"é".repeat((256 * 1024 - 2) / 2)}`);
  });
});

describe("the revision", () => {
  it("stays the same while no module file changes", async () => {
    const created = project();
    const reader = readerOf(created.root);
    const revision = await reader.revision();
    created.write("README.md", "Not a module file.\n");
    created.write("editors/note-editor/node_modules/pkg/index.js", "");
    created.write("editors/note-editor/dist/editor.js", "");
    created.write("editors/.cache/state.json", "{}");

    expect(await reader.revision()).toBe(revision);
    expect((await reader.snapshot()).revision).toBe(revision);
  });

  it.each([
    ["a module file", "editors/note-editor/editor.ts"],
    ["a model's specification", NOTE_JSON],
    ["the manifest", "powerhouse.manifest.json"],
    ["the config", "powerhouse.config.json"],
  ])("changes when %s changes", async (_what, path) => {
    const created = project();
    const reader = readerOf(created.root);
    const revision = await reader.revision();
    created.write(path, `${created.read(path)}\n`);

    expect(await reader.revision()).not.toBe(revision);
  });

  it("changes when a file is added or removed", async () => {
    const created = project();
    const reader = readerOf(created.root);
    const revision = await reader.revision();
    created.write("subgraphs/note-stats/resolvers.ts", "export {};\n");
    const added = await reader.revision();
    created.remove("subgraphs/note-stats/resolvers.ts");

    expect(added).not.toBe(revision);
    expect(await reader.revision()).toBe(revision);
  });
});

describe("the reader", () => {
  it("shares one read between requests for the same revision", async () => {
    const { root } = project();
    const reader = readerOf(root);
    const [first, second] = await Promise.all([
      reader.snapshot(),
      reader.snapshot(),
    ]);

    expect(second).toBe(first);
    expect(await reader.snapshot()).toBe(first);
  });

  it("reads again once the project changes", async () => {
    const created = project();
    const reader = readerOf(created.root);
    const before = await reader.snapshot();
    editNote(created, (note) => {
      note.name = "Memo";
    });
    const after = await reader.snapshot();

    expect(after.revision).not.toBe(before.revision);
    expect(items(after.documentModels)[0].name).toBe("Memo");
    expect(check(items(after.documentModels)[0], "manifest")).toMatchObject({
      state: "warn",
      label: "Listed in powerhouse.manifest.json as Note",
    });
  });

  it("writes nothing to the project, not even a module directory it lacks", async () => {
    const { root } = project({ subgraphs: null, processors: null });
    const before = fingerprint(root);
    const reader = readerOf(root);
    const snapshot = await reader.snapshot();
    await reader.documentModel("fixture/note");
    await reader.fileList();

    expect(snapshot.subgraphs).toEqual({ ok: true, items: [] });
    expect(snapshot.processors).toEqual({ ok: true, items: [] });
    expect(fingerprint(root)).toEqual(before);
  });
});

describe("duplicate ids", () => {
  it("reports two editor folders that declare one id and lists both", async () => {
    const { root } = project({
      "editors/note-editor-copy/module.ts":
        'export const Copy = { documentTypes: ["fixture/note"], config: { id: "note-editor", name: "Copy" } };\n',
    });
    const snapshot = await readerOf(root).snapshot();

    expect(
      items(snapshot.editors).map(({ id, folder }) => `${id} ${folder}`),
    ).toEqual([
      "draft-editor editors/draft-editor",
      "note-editor editors/note-editor",
      "note-editor editors/note-editor-copy",
    ]);
    expect(snapshot.diagnostics).toEqual([
      {
        severity: "error",
        message:
          "editors/note-editor and editors/note-editor-copy both declare the editor id note-editor.",
        file: "editors/note-editor-copy/module.ts",
        repair: "Give editors/note-editor-copy its own editor id.",
      },
    ]);
  });

  it("shows one folder for a document type two folders declare, and says which", async () => {
    const created = project();
    const memo = JSON.parse(created.read(NOTE_JSON)) as Note & {
      description: string;
    };
    memo.description = "The copy.";
    created.write(
      "document-models/memo/memo.json",
      `${JSON.stringify(memo, null, 2)}\n`,
    );
    const reader = readerOf(created.root);
    const snapshot = await reader.snapshot();
    const detail = await reader.documentModel("fixture/note");

    expect(
      items(snapshot.documentModels).map(
        ({ documentType, description, folder }) =>
          `${documentType} ${description} ${folder}`,
      ),
    ).toEqual(["fixture/note The copy. document-models/memo"]);
    expect(detail?.specifications.map(({ version }) => version)).toEqual([1]);
    expect(detail?.folder).toBe("document-models/memo");
    expect(snapshot.diagnostics).toContainEqual({
      severity: "error",
      message:
        "document-models/memo and document-models/note both declare the document type fixture/note. Only document-models/memo is read.",
      file: NOTE_JSON,
      repair:
        "Give the model in document-models/note its own document type, or remove the folder.",
    });
  });
});

describe("where the files are", () => {
  it("reads the models of an absolute documentModelsDir inside the project", async () => {
    const created = project();
    renameSync(
      join(created.root, "document-models"),
      join(created.root, "models"),
    );
    created.write(
      "powerhouse.config.json",
      JSON.stringify({ documentModelsDir: join(created.root, "models") }),
    );
    const reader = readerOf(created.root);
    const [note] = items((await reader.snapshot()).documentModels);
    const revision = await reader.revision();
    created.write("models/note/v1/src/reducers/content.ts", "export {};\n");

    expect(note.folder).toBe("models/note");
    expect(check(note, "registered")?.label).toBe(
      "Registered in models/document-models.ts",
    );
    expect(await reader.revision()).not.toBe(revision);
  });

  it("follows a symlinked model folder that stays inside the project", async () => {
    const created = project();
    renameSync(
      join(created.root, "document-models", "note"),
      join(created.root, "shared-note"),
    );
    symlinkSync(
      join(created.root, "shared-note"),
      join(created.root, "document-models", "note"),
      linkType,
    );
    const reader = readerOf(created.root);
    const detail = await reader.documentModel("fixture/note");
    const revision = await reader.revision();
    created.write("shared-note/v1/schema.graphql", "type NoteState\n");

    expect(detail?.folder).toBe("document-models/note");
    expect(detail?.specifications.map(({ version }) => version)).toEqual([1]);
    expect(await reader.revision()).not.toBe(revision);
  });

  it("skips a symlink that leaves the project, and one that loops", async () => {
    const created = project();
    const outside = mkdtempSync(join(tmpdir(), "ph-project-reader-outside-"));
    disposers.push(() => rmSync(outside, { recursive: true, force: true }));
    symlinkSync(outside, join(created.root, "editors", "outside"), linkType);
    symlinkSync(
      join(created.root, "editors"),
      join(created.root, "editors", "note-editor", "loop"),
      linkType,
    );
    const reader = readerOf(created.root);
    const revision = await reader.revision();
    const list = await reader.fileList();

    expect(
      list.modules
        .find(({ folder }) => folder === "editors/note-editor")
        ?.files.filter(({ path }) => path.includes("/loop/note-editor/loop/")),
    ).toEqual([]);
    created.write(join("editors", "outside", "module.ts"), "export {};\n");
    expect(await reader.revision()).toBe(revision);
  });
});

describe("reads of code-first models", () => {
  it("does not load the models again when only another folder changes", async () => {
    const created = project({
      "document-models/counted/index.ts": counting(),
    });
    const reader = readerOf(created.root);
    const before = await reader.snapshot();
    created.write(
      "editors/note-editor/editor.ts",
      'export const title = "Renamed";\n',
    );
    const after = await reader.snapshot();

    expect(after.revision).not.toBe(before.revision);
    expect(evaluations().evaluations).toBe(1);

    created.write(
      "document-models/counted/index.ts",
      `${counting()}// edited\n`,
    );
    await reader.snapshot();
    expect(evaluations().evaluations).toBe(2);
  });

  it("waits for the read in flight, then reads the latest revision once", async () => {
    const slow = counting(
      "await new Promise((done) => setTimeout(done, 300));",
    );
    const created = project({ "document-models/slow/index.ts": slow });
    const reader = readerOf(created.root);
    const first = reader.snapshot();
    await until(() => evaluations().running === 1);
    created.write("document-models/slow/index.ts", `${slow}// edited\n`);
    const [second, third] = await Promise.all([
      reader.snapshot(),
      reader.snapshot(),
    ]);

    expect(evaluations()).toEqual({
      evaluations: 2,
      running: 0,
      mostRunning: 1,
    });
    expect(third).toBe(second);
    expect(second.revision).not.toBe((await first).revision);
    expect(second.revision).toBe(await reader.revision());
  });

  it("follows a file a model imports from outside the module folders", async () => {
    const created = project({
      "src/shared.ts": 'export const shared = "one";\n',
      "src/unused.ts": "export {};\n",
      "document-models/outside/index.ts": `import "../../src/shared.js";\n${counting()}`,
    });
    const reader = readerOf(created.root);
    await reader.snapshot();
    const learned = await reader.revision();
    created.write("src/unused.ts", "export const unused = true;\n");
    const unrelated = await reader.revision();
    created.write(
      "src/shared.ts",
      'export const shared = "two, and longer";\n',
    );

    expect(unrelated).toBe(learned);
    expect(await reader.revision()).not.toBe(learned);
    await reader.snapshot();
    expect(evaluations().evaluations).toBe(2);
  });

  it("follows such a file when the project's path goes through a symlink", async () => {
    const created = project({
      "src/shared.ts": 'export const shared = "one";\n',
      "document-models/outside/index.ts": `import "../../src/shared.js";\n${counting()}`,
    });
    const links = mkdtempSync(join(tmpdir(), "ph-project-reader-link-"));
    disposers.push(() => rmSync(links, { recursive: true, force: true }));
    const linked = join(links, "project");
    symlinkSync(created.root, linked, linkType);
    const reader = readerOf(linked);
    await reader.snapshot();
    const learned = await reader.revision();
    created.write(
      "src/shared.ts",
      'export const shared = "two, and longer";\n',
    );

    expect(await reader.revision()).not.toBe(learned);
  });

  it("reads again after a while when a model's source did not import", async () => {
    let time = 0;
    const created = project({
      "src/shared.ts": "export const shared = ;\n",
      "document-models/outside/index.ts": `import "../../src/shared.js";\n${counting()}`,
    });
    const reader = readerOf(created.root, {
      now: () => time,
      retryAfterMs: 5000,
    });
    const failing = await reader.snapshot();
    // Nothing the revision is made from changes: the import never got as
    // far as telling which files it reads.
    created.write("src/shared.ts", 'export const shared = "fixed";\n');
    time = 4999;
    const kept = await reader.revision();
    time = 5000;
    const retried = await reader.snapshot();

    expect(evaluations().evaluations).toBe(1);
    expect(failing.diagnostics.map(({ file }) => file)).toContain(
      "document-models/outside/index.ts",
    );
    expect(kept).toBe(failing.revision);
    expect(retried.revision).not.toBe(failing.revision);
  });

  it("keeps the models it loaded when only another section is read again", async () => {
    let time = 0;
    const created = project({
      "tsconfig.json": null,
      "document-models/counted/index.ts": counting(),
    });
    const reader = readerOf(created.root, {
      now: () => time,
      retryAfterMs: 5000,
    });
    const failing = await reader.snapshot();
    expect(failing.editors.ok).toBe(false);
    expect(evaluations().evaluations).toBe(1);

    time = 5000;
    const retried = await reader.snapshot();

    expect(retried.revision).not.toBe(failing.revision);
    expect(evaluations().evaluations).toBe(1);
  });

  it(
    "stops a read that never finishes and closes its import server",
    { timeout: 30_000 },
    async () => {
      const created = project({
        "document-models/hang/index.ts":
          "await new Promise(() => {});\nexport {};\n",
      });
      const temp = mkdtempSync(join(tmpdir(), "ph-project-reader-temp-"));
      disposers.push(() => rmSync(temp, { recursive: true, force: true }));
      for (const name of ["TMPDIR", "TEMP", "TMP"]) vi.stubEnv(name, temp);
      const reader = readerOf(created.root, { buildTimeoutMs: 1500 });
      const failure = reader.snapshot().then(
        () => undefined,
        (error: unknown) => error,
      );

      // The importer keeps its Vite cache in a temp directory while its server is open.
      await until(() => readdirSync(temp).length === 1);
      expect(await failure).toMatchObject({
        message: expect.stringContaining(
          "Reading the project took longer than 1.5 s and was stopped.",
        ) as string,
      });
      await until(() => readdirSync(temp).length === 0);

      created.remove("document-models/hang");
      const snapshot = await reader.snapshot();
      expect(
        items(snapshot.documentModels).map(({ documentType }) => documentType),
      ).toEqual(["fixture/note"]);
      expect(readdirSync(temp)).toEqual([]);
    },
  );
});

describe("a read that was stopped", () => {
  it(
    "is not started again while its module runs, only when the files change",
    { timeout: 30_000 },
    async () => {
      let time = 0;
      const created = project({
        "document-models/hang/index.ts": counting(
          "await new Promise(() => {});",
        ),
      });
      const reader = readerOf(created.root, {
        buildTimeoutMs: 800,
        retryAfterMs: 5000,
        now: () => time,
      });
      const failed = (read: Promise<unknown>) =>
        read.then(
          () => "answered",
          (error: unknown) => (error as Error).message,
        );

      const first = await failed(reader.snapshot());
      expect(first).toContain("was stopped");
      time = 4999;
      expect(await failed(reader.snapshot())).toBe(first);
      expect(evaluations().evaluations).toBe(1);

      time = 60_000;
      expect(await failed(reader.snapshot())).toBe(first);
      expect(evaluations().evaluations).toBe(1);

      created.write("document-models/hang/index.ts", counting());
      expect(await failed(reader.snapshot())).toBe("answered");
      expect(evaluations()).toMatchObject({ evaluations: 2, running: 1 });
    },
  );
});

describe("the cost of a poll", () => {
  it("reuses a revision for a short while before fingerprinting again", async () => {
    let time = 1000;
    const created = project();
    const reader = createProjectReader(created.root, {
      now: () => time,
      revisionTtlMs: 300,
    });
    const revision = await reader.revision();
    created.write("editors/note-editor/editor.ts", "export {};\n");
    time += 299;
    const reused = await reader.revision();
    time += 1;

    expect(reused).toBe(revision);
    expect(await reader.revision()).not.toBe(revision);
  });

  it("reads a model's detail and the file list once per revision", async () => {
    const { root } = project();
    const reader = readerOf(root);

    expect(await reader.fileList()).toBe(await reader.fileList());
    expect(await reader.documentModel("fixture/note")).toBe(
      await reader.documentModel("fixture/note"),
    );
  });
});
