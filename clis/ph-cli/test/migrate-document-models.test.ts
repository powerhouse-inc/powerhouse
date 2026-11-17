import {
  generateDocumentModel,
  loadDocumentModel,
} from "@powerhousedao/codegen";
import type * as Codegen from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  definitionDifferences,
  migrateDocumentModels,
} from "../src/services/migrate-document-models.js";
import { snapshot } from "./migrate-subgraphs-project.js";
import {
  check,
  createModelProject,
  type Project,
  storedModel,
} from "./model-project.js";

/** Edits the converted definition.ts, standing in for a conversion bug. */
const conversion = vi.hoisted(() => ({
  tamper: undefined as ((definition: string) => string) | undefined,
}));
vi.mock("@powerhousedao/codegen", async (original) => {
  const codegen = await original<typeof Codegen>();
  return {
    ...codegen,
    migrateDocumentModel: async (
      options: Parameters<typeof codegen.migrateDocumentModel>[0],
    ) => {
      const migration = await codegen.migrateDocumentModel(options);
      const tamper = conversion.tamper;
      if (tamper === undefined || migration.kind !== "converted") {
        return migration;
      }
      return {
        ...migration,
        files: migration.files.map((file) =>
          file.path.endsWith("/v1/definition.ts") && file.after !== null
            ? { ...file, after: tamper(file.after) }
            : file,
        ),
      };
    },
  };
});

const NOTES = {
  id: "acme/notes",
  name: "Notes",
  description: "",
  extension: "",
  author: { name: "Acme", website: null },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type NotesState {\n  notes: [Note!]!\n}\n\ntype Note {\n  id: OID!\n  text: String!\n}",
          initialValue: '{"notes":[]}',
          examples: [],
        },
        local: { schema: "", initialValue: "", examples: [] },
      },
      modules: [
        {
          id: "notes",
          name: "notes",
          description: "",
          operations: [
            {
              id: "add-note",
              name: "ADD_NOTE",
              description: "",
              schema: "input AddNoteInput {\n  id: OID!\n  text: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};

const REDUCER = "document-models/notes/v1/src/reducers/notes.ts";
const reducer = (
  prelude = "",
) => `import type { NotesNotesOperations } from "../../gen/notes/operations.js";
${prelude}
export const notesNotesOperations: NotesNotesOperations = {
  addNoteOperation(state, action) {
    state.notes.push({ id: action.input.id, text: action.input.text.trim() });
  },
};
`;

let project: Project | undefined;
afterEach(() => {
  conversion.tamper = undefined;
  vi.unstubAllEnvs();
  project?.dispose();
});

/** A package with the schema-first Notes model, its reducer implemented. */
async function notesProject(prelude = ""): Promise<string> {
  project = createModelProject("empty", {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        strict: true,
        skipLibCheck: true,
        paths: { "document-models/*": ["./document-models/*/index.ts"] },
      },
    }),
    "notes.json": JSON.stringify(NOTES),
  });
  const { root } = project;
  const tsProject = buildTsMorphProject(root);
  await generateDocumentModel(
    await loadDocumentModel(join(root, "notes.json")),
    tsProject,
  );
  await tsProject.save();
  // The fixture installs no React, so it drops the generated hooks.
  rmSync(join(root, "document-models/notes/v1/hooks.ts"));
  const barrel = join(root, "document-models/notes/v1/index.ts");
  writeFileSync(
    barrel,
    readFileSync(barrel, "utf8").replace('export * from "./hooks.js";\n', ""),
  );
  const path = join(root, REDUCER);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, reducer(prelude));
  return root;
}

async function run(
  root: string,
  dryRun = false,
  dirs: string[] = [],
  renameConflictingTypes = false,
) {
  let output = "";
  const code = await migrateDocumentModels({
    projectDir: root,
    dirs,
    dryRun,
    renameConflictingTypes,
    out: (text) => void (output += text),
  });
  return { code, output };
}

/** Adds a stored Places model whose Address type has a catalog scalar's name. */
async function addPlaces(root: string) {
  const path = join(root, "places.json");
  writeFileSync(
    path,
    storedModel("acme/places", "Places", {
      globalSchema:
        "type PlacesState {\n  title: String!\n  home: Address\n}\n\ntype Address {\n  street: String!\n}",
    }),
  );
  const tsProject = buildTsMorphProject(root);
  await generateDocumentModel(await loadDocumentModel(path), tsProject);
  await tsProject.save();
  rmSync(join(root, "document-models/places/v1/hooks.ts"));
  const barrel = join(root, "document-models/places/v1/index.ts");
  writeFileSync(
    barrel,
    readFileSync(barrel, "utf8").replace('export * from "./hooks.js";\n', ""),
  );
}

describe("ph migrate --document-models", () => {
  it.each(["dist", "build"])(
    "refuses a model alias whose runtime condition loads a different file in %s",
    async (outputDir) => {
      const root = await notesProject();
      const source = "./document-models/notes/v1/gen/creators.ts";
      const runtime = `./${outputDir}/creators.js`;
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "ph-fixture-model-project",
          type: "module",
          exports: {
            "./document-models/notes/v1/gen/creators": {
              types: source,
              node: runtime,
              default: source,
            },
          },
        }),
      );
      mkdirSync(join(root, outputDir));
      writeFileSync(
        join(root, runtime),
        "export const addNote = () => 'runtime';\n",
      );
      writeFileSync(
        join(root, "consumer.ts"),
        'export { addNote } from "ph-fixture-model-project/document-models/notes/v1/gen/creators";\n',
      );
      const before = snapshot(root);
      for (const dryRun of [true, false]) {
        const result = await run(root, dryRun);
        expect(result.code).toBe(1);
        expect(result.output).toContain("static module reference");
        expect(snapshot(root)).toEqual(before);
      }
    },
    120_000,
  );

  it.each([
    "package import",
    "conditional import",
    "tsconfig path",
    "redirected generated alias",
  ])(
    "refuses an unrewriteable %s before deleting its model target",
    async (kind) => {
      const root = await notesProject();
      const target = "./document-models/notes/v1/gen/creators.ts";
      let specifier = "#legacy";
      if (kind.includes("import")) {
        const path = join(root, "package.json");
        const pkg = {
          name: "ph-fixture-model-project",
          version: "0.0.0",
          private: true,
          type: "module",
          imports: {
            "#legacy":
              kind === "conditional import"
                ? { custom: target, default: "./other-creators.ts" }
                : target,
          },
        };
        writeFileSync(path, JSON.stringify(pkg));
      } else {
        specifier =
          kind === "tsconfig path"
            ? "legacy-creators"
            : "document-models/notes/v1/gen/creators";
        const path = join(root, "tsconfig.json");
        const config = {
          compilerOptions: {
            module: "nodenext",
            strict: true,
            skipLibCheck: true,
            paths: {
              "document-models/*": ["./document-models/*/index.ts"],
              [specifier]: [
                kind === "tsconfig path" ? target : "./other-creators.ts",
              ],
            },
          },
        };
        writeFileSync(path, JSON.stringify(config));
      }
      writeFileSync(
        join(root, "other-creators.ts"),
        "export const addNote = (input: unknown) => ({ input });\n",
      );
      writeFileSync(
        join(root, "consumer.ts"),
        `export { addNote } from ${JSON.stringify(specifier)};\n`,
      );
      const before = snapshot(root);
      for (const dryRun of [true, false]) {
        const result = await run(root, dryRun);
        expect(result.code).toBe(1);
        expect(result.output).toContain("static module reference");
        expect(snapshot(root)).toEqual(before);
      }
    },
    120_000,
  );

  it.each(["file", "directory", "manifest"] as const)(
    "refuses a symlinked output %s without overwriting its authored target",
    async (kind) => {
      const root = await notesProject();
      const version = join(root, "document-models/notes/v1");
      const target =
        kind === "manifest"
          ? join(root, "authored-manifest.json")
          : kind === "file"
            ? join(version, "authored-definition.ts")
            : join(version, "custom-modules/notes.ts");
      const link =
        kind === "manifest"
          ? join(root, "powerhouse.manifest.json")
          : join(version, kind === "file" ? "definition.ts" : "modules");
      const authored =
        kind === "manifest"
          ? readFileSync(link, "utf8")
          : "export const authored = 42;\n";
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, authored);
      if (kind === "manifest") rmSync(link);
      symlinkSync(
        kind === "directory" ? dirname(target) : target,
        link,
        kind === "directory" ? "junction" : "file",
      );
      const before = snapshot(root);
      const linkedTo = readlinkSync(link);
      const preview = await run(root, true);
      expect(preview.code).toBe(1);
      expect(preview.output).toContain("symbolic link");
      expect(snapshot(root)).toEqual(before);
      const result = await run(root);
      expect(readFileSync(target, "utf8")).toBe(authored);
      expect(result.code).toBe(1);
      expect(result.output).toContain("symbolic link");
      expect(snapshot(root)).toEqual(before);
      expect(readlinkSync(link)).toBe(linkedTo);
    },
    120_000,
  );

  it("converts the model, checks every version against its stored definition and regenerates the barrels", async () => {
    const root = await notesProject();
    const { code, output } = await run(root);
    expect(output).toContain(
      "document-models/notes: converted acme/notes (versions 1) to code-first; every version keeps its definition",
    );
    expect(output).toContain("Regenerated");
    expect(code).toBe(0);
    expect(existsSync(join(root, "document-models/notes/notes.json"))).toBe(
      false,
    );
    expect(existsSync(join(root, "document-models/notes/v1/gen"))).toBe(false);
    expect(
      readFileSync(
        join(root, "document-models/notes/v1/modules/notes.ts"),
        "utf8",
      ),
    ).toContain("text: action.input.text.trim()");
    expect(
      readFileSync(join(root, "document-models/document-models.ts"), "utf8"),
    ).not.toContain("module.js");
    expect((await check(root, true)).code).toBe(0);

    expect(await run(root)).toEqual({
      code: 0,
      output: "No schema-first document models to convert.\n",
    });
    expect(await run(root, false, ["notes"])).toEqual({
      code: 0,
      output: "document-models/notes: already code-first\n",
    });
  }, 240_000);

  it("converts a model beside a stored file that is not a model, and still regenerates the barrels", async () => {
    const root = await notesProject();
    const bad = join(root, "document-models/zbad/zbad.json");
    mkdirSync(dirname(bad), { recursive: true });
    writeFileSync(bad, "null");
    const { code, output } = await run(root);
    expect(output).toContain("document-models/notes: converted acme/notes");
    expect(output).toContain(
      "document-models/zbad: not converted\n  document-models/zbad/zbad.json: document-models/zbad/zbad.json is not a stored document model",
    );
    expect(output).toContain("Regenerated");
    expect(code).toBe(1);
    expect(readFileSync(bad, "utf8")).toBe("null");
    expect(
      readFileSync(join(root, "document-models/index.ts"), "utf8"),
    ).not.toContain("module.js");
    rmSync(dirname(bad), { recursive: true });
    expect((await check(root, true)).code).toBe(0);
  }, 240_000);

  it.each([
    {
      dirs: ["src/notes"],
      output:
        "src/notes: not a directory of document-models/. Name a model directory, such as document-models/notes.\n",
    },
    {
      dirs: ["missing"],
      output:
        "document-models/missing: not found. Name a directory of document-models/ that holds a document model.\n",
    },
  ])(
    "refuses $dirs without converting anything",
    async ({ dirs, output }) => {
      const root = await notesProject();
      const before = snapshot(root, join(root, "document-models"));
      expect(await run(root, false, dirs)).toEqual({ code: 1, output });
      expect(snapshot(root, join(root, "document-models"))).toEqual(before);
    },
    240_000,
  );

  it("refuses a model whose stored specification is gone", async () => {
    const root = await notesProject();
    rmSync(join(root, "document-models/notes/notes.json"));
    expect(await run(root)).toEqual({
      code: 0,
      output: "No schema-first document models to convert.\n",
    });
    expect(await run(root, false, ["notes"])).toEqual({
      code: 1,
      output:
        "document-models/notes: not converted. It has generated code but no notes.json, so its specification cannot be read. Restore notes.json, then migrate again.\n",
    });
  }, 240_000);

  it("converts a named directory, named twice and with a trailing slash, beside a broken model it leaves alone", async () => {
    const root = await notesProject();
    const broken = join(root, "document-models/broken/broken.json");
    mkdirSync(dirname(broken), { recursive: true });
    writeFileSync(
      broken,
      storedModel("acme/broken", "Broken", {
        globalSchema: "type BrokenState {\n  title: Missing\n}",
      }),
    );
    const { code, output } = await run(root, false, [
      "document-models/notes/",
      "notes",
    ]);
    expect(output).toContain(
      "document-models/notes: converted acme/notes (versions 1) to code-first",
    );
    expect(code).toBe(0);
  }, 240_000);

  it("converts the models it can, and renames a type off a scalar's name only when asked", async () => {
    const root = await notesProject();
    await addPlaces(root);
    const places = join(root, "document-models/places");
    const before = snapshot(root, places);

    const refused = await run(root);
    expect(refused.output).toContain(
      "document-models/notes: converted acme/notes",
    );
    expect(refused.output).toContain(
      "declares a type named Address, which is also a Powerhouse catalog scalar",
    );
    expect(refused.output).toContain("--rename-conflicting-types");
    expect(refused.code).toBe(1);
    expect(snapshot(root, places)).toEqual(before);

    const renamed = await run(root, false, [], true);
    expect(renamed.output).toContain(
      "document-models/places: converted acme/places (versions 1) to code-first; every version keeps its definition",
    );
    expect(renamed.output).toContain(
      "Note: Version 1: the GraphQL type Address is now PlacesAddress",
    );
    expect(renamed.code).toBe(0);
    expect(readFileSync(join(places, "v1/definition.ts"), "utf8")).toContain(
      'ph.object("PlacesAddress"',
    );
    expect((await check(root, true)).code).toBe(0);
  }, 240_000);

  it("converts nothing when the project's document-model is older than ph-cli", async () => {
    const root = await notesProject();
    vi.stubEnv("WORKSPACE_VERSION", "999.0.0");
    const before = snapshot(root, join(root, "document-models"));
    const { code, output } = await run(root);
    expect(output).toContain(
      "No document model was converted. This project has document-model",
    );
    expect(output).toContain("Run ph migrate 999.0.0");
    expect(code).toBe(1);
    expect(snapshot(root, join(root, "document-models"))).toEqual(before);

    const preview = await run(root, true);
    expect(preview.output).toContain(
      "Until then, a real run converts nothing.",
    );
    expect(preview.output).toContain("would convert acme/notes");
  }, 240_000);

  it("converts nothing when a barrel holds a statement codegen did not write", async () => {
    const root = await notesProject();
    const barrel = join(root, "document-models/index.ts");
    writeFileSync(
      barrel,
      `${readFileSync(barrel, "utf8")}export const custom = 42;\n`,
    );
    const before = snapshot(root, join(root, "document-models"));
    const { code, output } = await run(root);
    expect(code).toBe(1);
    expect(output).toContain("No document model was converted.");
    expect(output).toContain("export const custom = 42;");
    expect(snapshot(root, join(root, "document-models"))).toEqual(before);
  }, 240_000);

  it("replaces the barrel statement older codegen wrote for the model it converts", async () => {
    const root = await notesProject();
    const barrel = join(root, "document-models/index.ts");
    writeFileSync(
      barrel,
      `${readFileSync(barrel, "utf8")}export { module as LegacyNotes } from "./notes/index.js";\n`,
    );
    const { code, output } = await run(root);
    expect(output).toContain("document-models/notes: converted acme/notes");
    expect(code).toBe(0);
    expect(readFileSync(barrel, "utf8")).not.toContain("LegacyNotes");
  }, 240_000);

  it("restores every file when the converted model loads with a different definition", async () => {
    const root = await notesProject();
    const files = snapshot(root, join(root, "document-models"));
    conversion.tamper = (definition) => {
      const changed = definition.replace(
        "text: ph.String(",
        "body: ph.String(",
      );
      if (changed === definition) throw new Error("no Note.text to rename");
      return changed;
    };
    const { code, output } = await run(root);
    expect(output).toContain(
      "document-models/notes: not converted; its files are restored.",
    );
    expect(output).toContain(
      "Version 1 of the converted model has a different definition:",
    );
    expect(output).toContain("Note.fields");
    expect(output).not.toContain("Regenerated");
    expect(code).toBe(1);
    expect(snapshot(root, join(root, "document-models"))).toEqual(files);
  }, 240_000);

  it("writes nothing with --dry-run", async () => {
    const root = await notesProject();
    const before = snapshot(root, join(root, "document-models"));
    const { code, output } = await run(root, true);
    expect(code).toBe(0);
    expect(output).toContain("document-models/notes: would convert acme/notes");
    expect(output).toContain("+++ b/document-models/notes/v1/definition.ts");
    expect(snapshot(root, join(root, "document-models"))).toEqual(before);
  }, 240_000);

  it("restores every file when the converted model does not load", async () => {
    // The schema-first reducer only runs inside the generated reducer; after
    // the conversion it runs whenever the model is imported.
    const root = await notesProject(
      'if (!process.env.NOTES_READY) throw new Error("notes cannot load");\n',
    );
    const before = snapshot(root, join(root, "document-models"));
    const { code, output } = await run(root);
    expect(output).toContain(
      "document-models/notes: not converted; its files are restored. The converted model does not pass ph model check:",
    );
    expect(output).toContain("could not be imported");
    expect(code).toBe(1);
    expect(snapshot(root, join(root, "document-models"))).toEqual(before);
  }, 240_000);
});

describe("definitionDifferences", () => {
  const definition = (values: string[], name = "SET_TITLE") => ({
    kind: "powerhouse.document-model",
    compatibility: { identity: "explicit-schema-first" },
    model: {
      documentType: "acme/notes",
      name: "Notes",
      description: "",
      extension: "",
    },
    specifications: [
      {
        version: 1,
        changeLog: [],
        scalars: [],
        graphQLCompatibility: null,
        types: [{ kind: "enum", name: "Mood", values }],
        state: {
          global: { root: { name: "NotesState" }, initialValue: {} },
          local: { root: null, initialValue: "" },
        },
        modules: [
          {
            id: "a",
            key: "notes",
            name: "notes",
            description: "",
            operations: [
              {
                id: "b",
                key: "setTitle",
                name,
                actionType: "SET_TITLE",
                creatorKey: "setTitle",
                scope: "global",
                description: null,
                template: "",
                reducer: "state.title = action.input.title",
                input: { kind: "input", name: "SetTitleInput", fields: [] },
                errors: [],
                examples: [],
              },
            ],
          },
        ],
      },
    ],
  });

  it("ignores IDs, stored names, reducer text and empty-text spellings", () => {
    expect(
      definitionDifferences(definition(["HAPPY"]), {
        ...definition(["HAPPY"], "SetTitle"),
        compatibility: { identity: "derived-v1" },
      }),
    ).toEqual([]);
  });

  it("compares input defaults exactly", () => {
    const withDefault = (defaultValue: unknown) => {
      const value = definition(["HAPPY"]);
      value.specifications[0].types.push({
        kind: "input",
        name: "TitleDefaults",
        fields: [{ name: "title", defaultValue }],
      } as never);
      return value;
    };
    expect(definitionDifferences(withDefault(""), withDefault(null))).toEqual([
      'specifications[0].types.TitleDefaults.fields[0].defaultValue: stored "", converted null',
    ]);
  });

  it("compares a member the rules do not list, and the scalar coercion", () => {
    const withExtra = (extra: number, coercion: string) => {
      const value = definition(["HAPPY"]);
      Object.assign(value.specifications[0].modules[0].operations[0], {
        extra,
      });
      return {
        ...value,
        compatibility: { ...value.compatibility, scalarCoercion: coercion },
      };
    };
    expect(
      definitionDifferences(withExtra(1, "catalog-v1"), withExtra(2, "strict")),
    ).toEqual([
      'compatibility.scalarCoercion: stored "catalog-v1", converted "strict"',
      "specifications[0].modules[0].operations[0].extra: stored 1, converted 2",
    ]);
  });

  it("reports a changed type", () => {
    expect(
      definitionDifferences(definition(["HAPPY"]), definition(["SAD"])),
    ).toEqual([
      'specifications[0].types.Mood.values[0]: stored "HAPPY", converted "SAD"',
    ]);
  });
});
