import type {
  DocumentModelDefinition,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { print } from "graphql";
import { describe, expect, it, vi } from "vitest";
import {
  buildDocumentModelSchema,
  DocumentModelSchemaCache,
} from "../src/utils/create-schema.js";
import { asStored, ledgerModel } from "./utils/code-first-models.js";

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

function withEntryDescription(
  module: DocumentModelModule,
  description: string,
): DocumentModelModule {
  const { definition } = module as DocumentModelModule & {
    definition: DocumentModelDefinition;
  };
  const spec = definition.specifications.at(-1)!;
  return {
    ...module,
    definition: {
      ...definition,
      specifications: [
        ...definition.specifications.slice(0, -1),
        {
          ...spec,
          types: spec.types.map((type) =>
            type.name === "LedgerEntry" ? { ...type, description } : type,
          ),
        },
      ],
    },
  } as DocumentModelModule;
}

const generatedSdl = (resolved: {
  schema?: { generated: readonly unknown[] };
}) =>
  print({
    kind: "Document",
    definitions: resolved.schema?.generated ?? [],
  } as never);

describe("DocumentModelSchemaCache keys", () => {
  it("keys a stored model as main does", () => {
    const [alpha] = new DocumentModelSchemaCache().resolve([
      makeModel("Alpha"),
    ]);
    expect(alpha.key).toBe("Api7oJYovfwCcwgj7R53o+cAnCocmbuiifYGnfLY4QU=");
  });

  it("reuses the build of an unchanged definition", () => {
    const { cache, build } = countingCache();
    const [first] = cache.resolve([ledgerModel()]);
    const [again] = cache.resolve([ledgerModel()]);

    expect(build).toHaveBeenCalledTimes(1);
    expect(again.schema).toBe(first.schema);
  });

  it("rebuilds when the definition changes under the same stored model", () => {
    const { cache, build } = countingCache();
    const ledger = ledgerModel();
    const [before] = cache.resolve([ledger]);
    const [after] = cache.resolve([
      withEntryDescription(ledger, "One line of the ledger."),
    ]);

    expect(build).toHaveBeenCalledTimes(2);
    expect(after.key).not.toBe(before.key);
    expect(generatedSdl(before)).not.toContain("One line of the ledger.");
    expect(generatedSdl(after)).toContain(
      '"One line of the ledger."\ntype Ledger_LedgerEntry {',
    );
  });

  it("serves the definition currently attached to the module object", () => {
    const cache = new DocumentModelSchemaCache();
    const ledger: DocumentModelModule & { definition?: unknown } =
      ledgerModel();
    const { definition } = ledger;
    const replaced: DocumentModelModule & { definition?: unknown } =
      withEntryDescription(ledger, "Replaced in place.");

    ledger.definition = undefined;
    const [stored] = cache.resolve([ledger]);
    ledger.definition = definition;
    const [original] = cache.resolve([ledger]);
    ledger.definition = replaced.definition;
    const [after] = cache.resolve([ledger]);

    expect(new Set([stored.key, original.key, after.key]).size).toBe(3);
    expect(generatedSdl(after)).toContain(
      '"Replaced in place."\ntype Ledger_LedgerEntry {',
    );
  });

  it("keys a model by what inspection serves, not by its definition's JSON", () => {
    const ledger = ledgerModel();
    const definition = (ledger as { definition?: unknown }).definition as {
      [key: string]: unknown;
    };
    const otherType = {
      ...ledger,
      documentModel: {
        ...ledger.documentModel,
        global: { ...ledger.documentModel.global, id: "other/model" },
      },
    } as DocumentModelModule;
    const unserializable = {
      ...ledger,
      definition: { ...definition, extra: () => undefined },
    } as DocumentModelModule;
    const keyOf = (module: DocumentModelModule) =>
      new DocumentModelSchemaCache().resolve([module])[0].key;

    expect(keyOf(otherType)).toBe(keyOf(asStored(otherType)));
    expect(keyOf(unserializable)).toBe(keyOf(asStored(ledger)));
    expect(keyOf(unserializable)).not.toBe(keyOf(ledger));
  });
});

describe("buildDocumentModelSchema", () => {
  it("namespaces each module sharing a definition by its own stored name", () => {
    const first = ledgerModel();
    const second = {
      ...first,
      documentModel: {
        ...first.documentModel,
        global: { ...first.documentModel.global },
      },
    } as DocumentModelModule;
    buildDocumentModelSchema(first);
    first.documentModel.global.name = "Renamed";
    const { subgraph } = buildDocumentModelSchema(second);
    expect(print(subgraph!.typeDefs)).toContain("Ledger_LedgerState");
    expect(print(subgraph!.typeDefs)).not.toContain("Renamed_");
  });
});
