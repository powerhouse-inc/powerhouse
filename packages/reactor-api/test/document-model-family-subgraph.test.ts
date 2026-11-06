import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  admitDocumentModels,
  documentModelSubgraphSources,
} from "../src/graphql/subgraph-admission.js";
import {
  DocumentModelSchemaCache,
  reservedTypeNames,
} from "../src/utils/create-schema.js";
import {
  asSchemaFirst,
  ledgerModel,
  taskFamilyModels,
} from "./utils/code-first-models.js";
import {
  hostFor,
  messages,
  recordingAuthorization,
} from "./utils/document-model-host.js";

function servedModule(
  modules: readonly DocumentModelModule[],
): DocumentModelModule {
  const { admitted, schemas } = admitDocumentModels(
    new DocumentModelSchemaCache<DocumentModelModule>().resolve(modules),
    reservedTypeNames([]),
  );
  const sources = documentModelSubgraphSources(admitted, schemas);
  expect(sources).toHaveLength(1);
  return sources[0].model;
}

function family(style: "code-first" | "schema-first") {
  const [v1, v2] = taskFamilyModels();
  return style === "code-first"
    ? { v1, v2 }
    : { v1: asSchemaFirst(v1), v2: asSchemaFirst(v2) };
}

const cases = (["code-first", "schema-first"] as const).flatMap((style) => [
  { style, order: "v1 loaded first" as const },
  { style, order: "v2 loaded first" as const },
]);

describe("the subgraph of a two-version document model", () => {
  it.each(cases)(
    "dispatches a v2-only operation ($style, $order)",
    async ({ style, order }) => {
      const { v1, v2 } = family(style);
      const host = hostFor(
        servedModule(order === "v1 loaded first" ? [v1, v2] : [v2, v1]),
      );

      const result = await host.run(`mutation {
        Task { setTitle(docId: "doc-1", input: { title: "Books" }) { id } }
      }`);

      expect(messages(result)).toEqual([]);
      expect((host.document().state as { global?: unknown }).global).toEqual({
        title: "Books",
        tasks: [],
      });
    },
  );

  it.each(cases)(
    "reads the v1 fields of a v1 document ($style, $order)",
    async ({ style, order }) => {
      const { v1, v2 } = family(style);
      const stored = v1.reducer(
        v1.utils.createDocument(),
        v1.actions.addTask({ id: "t1" }),
      );
      const host = hostFor(
        servedModule(order === "v1 loaded first" ? [v1, v2] : [v2, v1]),
        recordingAuthorization().authorization,
        stored,
      );

      const result = await host.run(`{ Task { document(idOrSlug: "doc-1") {
        document { state { global { tasks { id completed } } } }
      } } }`);

      expect(messages(result)).toEqual([]);
      expect(result.data).toEqual({
        Task: {
          document: {
            document: {
              state: { global: { tasks: [{ id: "t1", completed: false }] } },
            },
          },
        },
      });
    },
  );
});

describe("the subgraph of a one-version document model", () => {
  it("dispatches its operations", async () => {
    const host = hostFor(servedModule([ledgerModel()]));

    const result = await host.run(`mutation {
      Ledger { addEntry(docId: "doc-1", input: { id: "e1", amount: 5 }) { id } }
    }`);

    expect(messages(result)).toEqual([]);
    expect((host.document().state as { global?: unknown }).global).toEqual({
      title: null,
      entries: [{ id: "e1", amount: 5 }],
    });
  });
});
