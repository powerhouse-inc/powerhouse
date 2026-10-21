import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  ph,
} from "document-model";
import { Kind, print } from "graphql";
import { describe, expect, it, vi } from "vitest";
import {
  buildDocumentModelSchema,
  type DocumentModelSchema,
  DocumentModelSchemaCache,
} from "../src/utils/create-schema.js";

function makeModel(name: string, stateSchema?: string): DocumentModelModule {
  return {
    documentModel: {
      global: {
        id: `test/${name.toLowerCase()}`,
        name,
        specifications: [
          {
            version: 1,
            modules: [
              {
                name: "core",
                operations: [
                  {
                    name: "doThing",
                    schema: "input DoThingInput { x: String }",
                  },
                ],
              },
            ],
            state: {
              global: {
                schema: stateSchema ?? `type ${name}State { name: String }`,
              },
              local: { schema: "" },
            },
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
}

function countingCache() {
  const build = vi.fn(buildDocumentModelSchema);
  return { cache: new DocumentModelSchemaCache(build), build };
}

describe("DocumentModelSchemaCache", () => {
  it("builds an unchanged model once across resolves", () => {
    const { cache, build } = countingCache();
    const models = [makeModel("Alpha"), makeModel("Beta")];

    const [first] = cache.resolve(models);
    cache.resolve(models);
    const [again] = cache.resolve(models);

    expect(build).toHaveBeenCalledTimes(2);
    expect(again.schema).toBe(first.schema);
  });

  it("reuses the schema of a model reloaded with the same text", () => {
    const { cache, build } = countingCache();
    const [first] = cache.resolve([makeModel("Alpha")]);
    const [reloaded] = cache.resolve([makeModel("Alpha")]);

    expect(build).toHaveBeenCalledTimes(1);
    expect(reloaded.schema).toBe(first.schema);
  });

  it("rebuilds a model reloaded under the same id and version with new text", () => {
    const { cache, build } = countingCache();
    cache.resolve([makeModel("Alpha")]);
    const [changed] = cache.resolve([
      makeModel("Alpha", "type AlphaState { name: String extra: Int }"),
    ]);

    expect(build).toHaveBeenCalledTimes(2);
    const state = changed.schema?.subgraph?.typeNames;
    expect(state?.has("Alpha_FullState")).toBe(true);
    const printed = JSON.stringify(changed.schema?.generated);
    expect(printed).toContain('"extra"');
  });

  it("holds a failure, so a broken model is built once", () => {
    const { cache, build } = countingCache();
    const broken = makeModel("Broken", "type BrokenState { name: String");

    const [first] = cache.resolve([broken]);
    const [again] = cache.resolve([
      makeModel("Broken", "type BrokenState { name: String"),
    ]);

    expect(build).toHaveBeenCalledTimes(1);
    expect(first.error?.message).toMatch(/Syntax Error/);
    expect(again.error).toBe(first.error);
    expect(again.key).toBe(first.key);
  });

  it("holds the failure of a model it cannot key, and resolves the rest", () => {
    const { cache } = countingCache();
    const cyclic = makeModel("Cyclic");
    const [spec] = cyclic.documentModel.global.specifications as unknown as {
      self?: unknown;
    }[];
    spec.self = spec;

    const [unkeyed, alpha] = cache.resolve([cyclic, makeModel("Alpha")]);

    expect(unkeyed.key).toBe("unkeyed:test/cyclic");
    expect(unkeyed.error?.message).toMatch(/circular/i);
    expect(alpha.schema).toBeDefined();
  });

  it("keeps a model's generated types when only its subgraph fails", () => {
    const opsOnly = makeModel("Ops");
    const [module] = opsOnly.documentModel.global.specifications[0].modules;
    module.operations[0].schema = "input DoThingInput { x: Missing }";

    const schema = buildDocumentModelSchema(opsOnly);
    expect(schema.generated.length).toBeGreaterThan(0);
    expect(schema.subgraph).toBeUndefined();
    expect(schema.subgraphError?.message).toMatch(/Missing/);

    const withoutSubgraph = buildDocumentModelSchema(opsOnly, {
      subgraph: false,
    });
    expect(withoutSubgraph.subgraphError).toBeUndefined();
  });

  it("keeps only the models of the last resolve", () => {
    const { cache, build } = countingCache();
    const alpha = makeModel("Alpha");
    cache.resolve([alpha]);
    cache.resolve([makeModel("Beta")]);
    cache.resolve([alpha]);

    expect(build).toHaveBeenCalledTimes(3);
  });
});

describe("DocumentModelSchemaCache with code-first models", () => {
  function notesModel(): DocumentModelModule {
    const context = defineDocumentModel({
      id: "test/notes",
      name: "Notes",
      description: "",
      extension: "notes",
      version: 1,
      author: { name: "Powerhouse", website: null },
      specifications: {
        global: {
          schema: ph.object("NotesState", { fields: { title: ph.String() } }),
          initialValue: { title: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    return defineDocumentModelFamily({
      versions: [context.version({ modules: [] })],
      upgradeManifest: {
        documentType: "test/notes",
        latestVersion: 1,
        supportedVersions: [1],
        upgrades: {},
      },
    }).at(1) as unknown as DocumentModelModule;
  }

  /** The same stored specification, with a definition that describes the state type. */
  function withStateDescription(
    model: DocumentModelModule,
    description: string,
  ): DocumentModelModule {
    const definition = JSON.parse(
      JSON.stringify((model as { definition?: unknown }).definition),
    ) as {
      specifications: { types: { name: string; description: unknown }[] }[];
    };
    const state = definition.specifications
      .at(-1)!
      .types.find((type) => type.name === "NotesState")!;
    state.description = description;
    return { ...model, definition } as DocumentModelModule;
  }

  const printed = (schema: DocumentModelSchema | undefined) =>
    print({ kind: Kind.DOCUMENT, definitions: schema?.generated ?? [] });

  it("reuses the schema of a code-first model declared again with the same definition", () => {
    const { cache, build } = countingCache();

    const [first] = cache.resolve([notesModel()]);
    const [again] = cache.resolve([notesModel()]);

    expect(build).toHaveBeenCalledTimes(1);
    expect(again.schema).toBe(first.schema);
  });

  it("rebuilds a code-first model whose definition changed under the same stored specification", () => {
    const { cache, build } = countingCache();
    const model = notesModel();
    const described = withStateDescription(model, "Notes, described.");

    const [first] = cache.resolve([model]);
    const [changed] = cache.resolve([described]);

    expect(described.documentModel).toBe(model.documentModel);
    expect(build).toHaveBeenCalledTimes(2);
    expect(printed(first.schema)).not.toContain("Notes, described.");
    expect(printed(changed.schema)).toContain(
      '"Notes, described."\ntype Notes_NotesState',
    );
  });
});
