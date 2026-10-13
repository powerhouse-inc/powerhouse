import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import {
  buildDocumentModelSchema,
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

  it("keeps only the models of the last resolve", () => {
    const { cache, build } = countingCache();
    const alpha = makeModel("Alpha");
    cache.resolve([alpha]);
    cache.resolve([makeModel("Beta")]);
    cache.resolve([alpha]);

    expect(build).toHaveBeenCalledTimes(3);
  });
});
