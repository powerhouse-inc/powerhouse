// test suite for the switchboard hooks

import {
  defineDocumentModel,
  ph,
  type DocumentModelModule,
} from "document-model";
import lzString from "lz-string";
import { describe, expect, it } from "vitest";
import { GetDocumentWithOperationsDocument } from "../src/graphql/gen/schema.js";
import {
  buildDocumentSubgraphUrl,
  getDocumentGraphqlQuery,
  getDocumentStateSelection,
  getSwitchboardBaseFromChannelUrl,
  getSwitchboardGatewayUrlFromDriveUrl,
} from "../src/utils/switchboard.js";

// The explorerURLState value is an lz-compressed JSON payload wrapping a
// document query; decode and assert on its contents rather than a hardcoded
// blob that rots whenever the query document evolves.
function decodeExplorerState(url: string) {
  const state = new URL(url).searchParams.get("explorerURLState");
  expect(state).toBeTruthy();
  return JSON.parse(lzString.decompressFromEncodedURIComponent(state!)) as {
    document: string;
    variables: string;
    headers?: string;
  };
}

const documentWithOperationsQuery =
  GetDocumentWithOperationsDocument.loc!.source.body;

// A minimal invoice document model: the global state SDL is the source of the
// model-scoped query's state selection, mirroring what the server derives in
// `generateNewApiSchema` (create-schema.ts).
const fakeInvoiceModel = {
  documentModel: {
    global: {
      id: "powerhouse/invoice",
      name: "powerhouse/invoice",
      description: "",
      extension: "invoice",
      author: { name: "Test", website: null },
      specifications: [
        {
          version: 1,
          changeLog: [],
          modules: [],
          state: {
            global: {
              schema:
                "type PowerhouseInvoiceState { name: String! total: Int }",
              initialValue: "{}",
            },
            local: { schema: "", initialValue: "{}" },
          },
        },
      ],
    },
  },
} as unknown as DocumentModelModule;

describe("Switchboard hooks", () => {
  it.each([false, true])(
    "handles compiled code-first abstract state (union: %s)",
    (union) => {
      const Entry = ph.interface("Entry", {
        fields: { label: ph.String({ required: true }) },
      });
      const Note = ph.object("Note", {
        implements: [Entry],
        fields: { label: ph.String({ required: true }), body: ph.String() },
      });
      const Link = ph.object("Link", {
        implements: [Entry],
        fields: { label: ph.String({ required: true }), href: ph.String() },
      });
      const Value = union
        ? ph.union("Value", { members: [Note, Link] })
        : Entry;
      const context = defineDocumentModel({
        id: "test/explorer",
        name: "Explorer",
        description: "",
        extension: "explorer",
        version: 1,
        author: { name: "Test", website: null },
        specifications: {
          global: {
            schema: ph.object("ExplorerState", {
              fields: {
                entries: ph.list(ph.ref(Value, { required: true })),
                notes: ph.list(ph.ref(Note)),
                links: ph.list(ph.ref(Link)),
              },
            }),
            initialValue: { entries: null, notes: null, links: null },
          },
          local: { schema: null, initialValue: {} },
        },
      });
      const model = context.finalize({
        modules: [],
      }) as unknown as DocumentModelModule;
      const url = buildDocumentSubgraphUrl(
        "http://localhost:4001/graphql/r",
        "test/explorer",
        "doc-1",
        model,
      );
      expect(decodeExplorerState(url).document).toBe(
        getDocumentGraphqlQuery().trim(),
      );
    },
  );

  it.each([
    "type Note { body: String! } type Link { href: String! } union Entry = Note | Link",
    "interface Entry { label: String! } type Note implements Entry { label: String! }",
  ])("uses the generic query for abstract state types: %s", (declaration) => {
    const model = structuredClone(fakeInvoiceModel);
    model.documentModel.global.specifications[0].state.global.schema = `${declaration}\ntype PowerhouseInvoiceState { entries: [Entry!] }`;
    const url = buildDocumentSubgraphUrl(
      "http://localhost:4001/graphql/r",
      "powerhouse/invoice",
      "doc-1",
      model,
    );
    expect(decodeExplorerState(url).document).toBe(
      getDocumentGraphqlQuery().trim(),
    );
  });

  it("should return the proper switchboard url", () => {
    const url = getSwitchboardGatewayUrlFromDriveUrl(
      "https://example.com/d/123",
    );
    expect(url).toBe("https://example.com/graphql");
  });

  it("should return the proper switchboard link", () => {
    const url = buildDocumentSubgraphUrl(
      "https://example.com/graphql/r",
      "test/doc",
      "test-document",
    );

    expect(
      url.startsWith("https://example.com/explorer?explorerURLState="),
    ).toBe(true);

    const payload = decodeExplorerState(url);
    expect(payload.document).toBe(getDocumentGraphqlQuery().trim());
    expect(JSON.parse(payload.variables)).toEqual({
      identifier: "test-document",
    });
    expect(payload.headers).toBeUndefined();
  });

  it("should include an Authorization header when an auth token is given", () => {
    const url = buildDocumentSubgraphUrl(
      "https://example.com/graphql/r",
      "test/doc",
      "test-document",
      undefined,
      "tok-123",
    );

    const payload = decodeExplorerState(url);
    expect(JSON.parse(payload.headers!)).toEqual({
      Authorization: "Bearer tok-123",
    });
  });

  it("builds a model-scoped query from the document model (acceptance a)", () => {
    const url = buildDocumentSubgraphUrl(
      "http://localhost:4001/graphql/r",
      "powerhouse/invoice",
      "doc-1",
      fakeInvoiceModel,
    );

    // The URL points at the explorer page, not the raw channel endpoint.
    expect(new URL(url).pathname).toBe("/explorer");

    const payload = decodeExplorerState(url);
    expect(payload.document.length).toBeGreaterThan(0);
    expect(payload.document).toContain("PowerhouseInvoice {");
    expect(payload.document).toContain("document(identifier: $identifier)");
    expect(payload.document).toContain("state {");
    expect(payload.document).toContain("global {");
    expect(payload.document).toContain("name total");
    expect(payload.document).toContain("childIds");
    expect(JSON.parse(payload.variables)).toEqual({ identifier: "doc-1" });
  });

  it("falls back to the generic document query without a model (acceptance b)", () => {
    const url = buildDocumentSubgraphUrl(
      "http://localhost:4001/graphql/r",
      "powerhouse/invoice",
      "doc-1",
    );

    expect(new URL(url).pathname).toBe("/explorer");

    const payload = decodeExplorerState(url);
    expect(payload.document.length).toBeGreaterThan(0);
    expect(payload.document).toBe(documentWithOperationsQuery.trim());
    expect(payload.document).toContain("document(identifier: $identifier");
    expect(payload.document).toContain("state");
    expect(JSON.parse(payload.variables)).toEqual({ identifier: "doc-1" });
  });
});

describe("getSwitchboardBaseFromChannelUrl", () => {
  it("strips the /graphql/r suffix, preserving proxy prefixes", () => {
    expect(
      getSwitchboardBaseFromChannelUrl(
        "https://example.com/api/reactor/graphql/r",
      ),
    ).toBe("https://example.com/api/reactor");
  });

  it("strips the /graphql/r suffix for a plain origin", () => {
    expect(
      getSwitchboardBaseFromChannelUrl("http://localhost:4001/graphql/r"),
    ).toBe("http://localhost:4001");
  });

  it("falls back to the origin when the suffix is absent", () => {
    expect(
      getSwitchboardBaseFromChannelUrl("http://localhost:4001/graphql/x"),
    ).toBe("http://localhost:4001");
  });
});

describe("getDocumentStateSelection", () => {
  function modelWithGlobalSchema(schema: string): DocumentModelModule {
    return {
      documentModel: {
        global: {
          ...fakeInvoiceModel.documentModel.global,
          specifications: [
            {
              version: 1,
              changeLog: [],
              modules: [],
              state: {
                global: { schema, initialValue: "{}" },
                local: { schema: "", initialValue: "{}" },
              },
            },
          ],
        },
      },
    } as unknown as DocumentModelModule;
  }

  it("expands nested objects, enums and lists (acceptance c2)", () => {
    const model = modelWithGlobalSchema(`
      enum Status { OPEN CLOSED }
      type LineItem { sku: String! qty: Int }
      type InvoiceState { title: String! status: Status items: [LineItem!]! }
    `);

    expect(getDocumentStateSelection(model)).toBe(
      "title status items { sku qty }",
    );
  });

  it("throws when the global state schema is empty", () => {
    expect(() =>
      getDocumentStateSelection(modelWithGlobalSchema("")),
    ).toThrow();
  });

  it("throws when the schema has no root object type", () => {
    expect(() =>
      getDocumentStateSelection(modelWithGlobalSchema("enum Status { OPEN }")),
    ).toThrow();
  });
});
