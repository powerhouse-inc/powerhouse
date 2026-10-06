import { DOCUMENT_REF_KEY } from "@powerhousedao/pieces-framework/workflow";
import { describe, expect, it } from "vitest";
import {
  documentEventTree,
  documentReferenceTree,
  documentTree,
  fieldsFromSdl,
  fromOutputSchema,
  fromSample,
} from "./output-tree.js";

const SDL = `
enum Status { OPEN CLOSED }

type Item {
  id: OID!
  label: String
}

type TicketState {
  title: String!
  status: Status!
  items: [Item!]!
}

type TicketLocalState {
  draft: String
}
`;

describe("fieldsFromSdl", () => {
  it("builds the state type's field tree, recursing into local types", () => {
    expect(fieldsFromSdl(SDL, { state: "Ticket" })).toEqual([
      { name: "title", type: "String!" },
      { name: "status", type: "Status!" },
      {
        name: "items",
        type: "[Item!]!",
        children: [
          { name: "id", type: "OID!" },
          { name: "label", type: "String" },
        ],
      },
    ]);
  });

  it("takes the state root from the model name, not declaration order", () => {
    const sdl = `
type AddressState { street: String! }
type InvoiceState { total: Float!, billTo: AddressState }
`;
    expect(fieldsFromSdl(sdl, { state: "Invoice" })).toEqual([
      { name: "total", type: "Float!" },
      {
        name: "billTo",
        type: "AddressState",
        children: [{ name: "street", type: "String!" }],
      },
    ]);
  });

  it("accepts the <Model>GlobalState name", () => {
    const sdl = `type DocumentModelGlobalState { name: String! }`;
    expect(fieldsFromSdl(sdl, { state: "DocumentModel" })).toEqual([
      { name: "name", type: "String!" },
    ]);
  });

  it("takes the operation input root from the operation name", () => {
    const input = `
input LineInput { amount: Float! }
input SetUrlInput { url: URL!, line: LineInput }
`;
    expect(fieldsFromSdl(input, { input: "SET_URL" })).toEqual([
      { name: "url", type: "URL!" },
      {
        name: "line",
        type: "LineInput",
        children: [{ name: "amount", type: "Float!" }],
      },
    ]);
    expect(
      fieldsFromSdl("input SetURLInput { url: URL! }", { input: "SET_URL" }),
    ).toEqual([{ name: "url", type: "URL!" }]);
  });

  it("returns [] when the spec's root type is not declared", () => {
    expect(fieldsFromSdl(SDL, { state: "Invoice" })).toEqual([]);
    expect(
      fieldsFromSdl("input OtherInput { a: Int }", { input: "SET_URL" }),
    ).toEqual([]);
  });

  it("returns [] for unparseable SDL", () => {
    expect(fieldsFromSdl("not sdl {{", { state: "Ticket" })).toEqual([]);
  });
});

describe("fromOutputSchema", () => {
  it("maps fields with nested properties and list items", () => {
    expect(
      fromOutputSchema({
        fields: [
          { key: "id", format: "text", description: "Message id" },
          {
            key: "author",
            properties: [{ key: "username", format: "text" }],
          },
          { key: "embeds", listItems: [{ key: "title", format: "text" }] },
        ],
      }),
    ).toEqual([
      { name: "id", type: "text", description: "Message id" },
      {
        name: "author",
        type: "object",
        description: undefined,
        children: [{ name: "username", type: "text", description: undefined }],
      },
      {
        name: "embeds",
        type: "array",
        description: undefined,
        children: [{ name: "title", type: "text", description: undefined }],
      },
    ]);
  });

  it("returns [] for absent schemas", () => {
    expect(fromOutputSchema(null)).toEqual([]);
    expect(fromOutputSchema({})).toEqual([]);
  });

  // google-docs style: key is a display name, value is the real path.
  it("follows value paths and merges shared prefixes", () => {
    expect(
      fromOutputSchema({
        fields: [
          { key: "documentId", label: "Document ID", value: "data.documentId" },
          {
            key: "requiredRevisionId",
            value: "data.writeControl.requiredRevisionId",
          },
          { key: "status", label: "Status Code", value: "status" },
        ],
      }),
    ).toEqual([
      {
        name: "data",
        type: "object",
        children: [
          {
            name: "documentId",
            type: "value",
            description: undefined,
          },
          {
            name: "writeControl",
            type: "object",
            children: [
              {
                name: "requiredRevisionId",
                type: "value",
                description: undefined,
              },
            ],
          },
        ],
      },
      { name: "status", type: "value", description: undefined },
    ]);
  });

  it("maps children with relative value paths", () => {
    expect(
      fromOutputSchema({
        fields: [
          {
            key: "file",
            value: "file",
            children: [{ key: "id", value: "id" }],
          },
        ],
      }),
    ).toEqual([
      {
        name: "file",
        type: "object",
        description: undefined,
        children: [{ name: "id", type: "value", description: undefined }],
      },
    ]);
  });

  // ask-lmm style: run() returns a bare value; value:"" means whole output.
  it("treats value:'' scalars as the output itself (no sub-paths)", () => {
    expect(
      fromOutputSchema({
        fields: [{ key: "response", label: "Response", value: "" }],
      }),
    ).toEqual([]);
  });

  it("hoists children of a whole-output wrapper field", () => {
    expect(
      fromOutputSchema({
        fields: [
          {
            key: "rows",
            value: "",
            listItems: [{ key: "cell", format: "text" }],
          },
        ],
      }),
    ).toEqual([{ name: "cell", type: "text", description: undefined }]);
  });
});

describe("fromSample", () => {
  it("infers types from an authored sample", () => {
    expect(
      fromSample({ title: "x", count: 2, tags: ["a"], meta: { ok: true } }),
    ).toEqual([
      { name: "title", type: "string" },
      { name: "count", type: "number" },
      {
        name: "tags",
        type: "array",
        children: [{ name: "0", type: "string" }],
      },
      {
        name: "meta",
        type: "object",
        children: [{ name: "ok", type: "boolean" }],
      },
    ]);
  });
});

describe("static trees", () => {
  it("wraps document state and event action input", () => {
    const document = documentTree([{ name: "title", type: "String!" }]);
    expect(document.map((node) => node.name)).toEqual(["header", "state"]);
    expect(document.at(-1)).toMatchObject({
      name: "state",
      children: [
        { name: "global", children: [{ name: "title", type: "String!" }] },
      ],
    });
    expect(documentReferenceTree().map((node) => node.name)).toEqual([
      "documentId",
      "documentType",
      "branch",
      "revision",
    ]);
    const event = documentEventTree([{ name: "name", type: "String!" }]);
    const action = event.find((node) => node.name === "action");
    expect(action?.children?.find((n) => n.name === "input")).toMatchObject({
      children: [{ name: "name", type: "String!" }],
    });
  });
});

describe("fromSample with document references", () => {
  it("shows a reference as the document shape it was given", () => {
    const nodes = fromSample(
      {
        [DOCUMENT_REF_KEY]: {
          documentId: "doc-1",
          documentType: "acme/ticket",
          branch: "main",
          revision: { global: 2 },
        },
        extractedFrom: { documentId: "prose" },
      },
      0,
      (reference) =>
        documentTree([
          { name: "title", type: `String! (${reference.documentType})` },
        ]),
    );
    expect(nodes.map((node) => node.name)).toEqual([
      "header",
      "state",
      "extractedFrom",
    ]);
    expect(nodes[1]?.children?.[0]?.children).toEqual([
      { name: "title", type: "String! (acme/ticket)" },
    ]);
  });
});
