import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { defineDocumentModel, materialize, ph } from "document-model";
import { describe, expect, it } from "vitest";
import { admitDocumentModels } from "../src/graphql/subgraph-admission.js";
import {
  DocumentModelSchemaCache,
  reservedTypeNames,
} from "../src/utils/create-schema.js";
import { asSchemaFirst } from "./utils/code-first-models.js";
import { hostFor, messages } from "./utils/document-model-host.js";

function codeModel(): DocumentModelModule {
  const context = defineDocumentModel({
    id: "test/code",
    name: "Code",
    description: "",
    extension: "code",
    version: 1,
    author: { name: "Powerhouse" },
    scopes: {
      global: {
        schema: ph.object("CodeState", {
          fields: { code: ph.String({ equals: "[A-Z]+" }) },
        }),
        initialValue: { code: null },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const main = context.module("main", {
    operations: ({ global }) => ({
      setCode: global({
        input: ph.input({
          fields: { code: ph.String({ required: true, equals: "[A-Z]+" }) },
        }),
        reduce(state, input) {
          state.code = input.code;
        },
      }),
    }),
  });
  return materialize(
    context.version({ modules: [main] }),
  ) as unknown as DocumentModelModule;
}

const styles = [
  ["code-first", codeModel()],
  ["schema-first", asSchemaFirst(codeModel())],
] as const;

const setCode = (code: string) =>
  `mutation { Code { setCode(docId: "doc-1", input: { code: "${code}" }) { id } } }`;

describe("a model whose fields use equals", () => {
  it.each(styles)("is admitted by the host as %s", (_style, model) => {
    const { admitted, refusals } = admitDocumentModels(
      new DocumentModelSchemaCache<DocumentModelModule>().resolve([model]),
      reservedTypeNames([]),
    );

    expect(refusals.map(({ reason }) => reason)).toEqual([]);
    expect(admitted).toEqual([model]);
  });

  it.each(styles)("serves its %s subgraph", async (_style, model) => {
    const host = hostFor(model);

    const result = await host.run(setCode("ABC"));

    expect(messages(result)).toEqual([]);
    expect((host.document().state as { global?: unknown }).global).toEqual({
      code: "ABC",
    });
  });

  it.each(styles)(
    "refuses %s input that does not match the pattern",
    async (_style, model) => {
      const host = hostFor(model);

      const result = await host.run(setCode("abc"));

      expect(messages(result)).toEqual([
        `Invalid action input: ${JSON.stringify(
          [
            {
              origin: "string",
              code: "invalid_format",
              format: "regex",
              pattern: "/^[A-Z]+$/",
              path: ["code"],
              message: "Invalid string: must match pattern /^[A-Z]+$/",
            },
          ],
          null,
          2,
        )}`,
      ]);
      expect((host.document().state as { global?: unknown }).global).toEqual({
        code: null,
      });
    },
  );
});
