import { describe, expect, it } from "vitest";
import {
  documentBlockTree,
  documentEventTree,
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
    expect(fieldsFromSdl(SDL)).toEqual([
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

  it("parses input types for operation schemas", () => {
    const input = `input SetNameInput {\n  name: String!\n}`;
    expect(fieldsFromSdl(input)).toEqual([{ name: "name", type: "String!" }]);
  });

  it("returns [] for unparseable SDL", () => {
    expect(fieldsFromSdl("not sdl {{")).toEqual([]);
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
});

describe("fromSample", () => {
  it("infers types from an authored sample", () => {
    expect(
      fromSample({ title: "x", count: 2, tags: ["a"], meta: { ok: true } }),
    ).toEqual([
      { name: "title", type: "string" },
      { name: "count", type: "number" },
      { name: "tags", type: "array", children: [{ name: "0", type: "string" }] },
      { name: "meta", type: "object", children: [{ name: "ok", type: "boolean" }] },
    ]);
  });
});

describe("static trees", () => {
  it("wraps document state and event action input", () => {
    const block = documentBlockTree([{ name: "title", type: "String!" }]);
    expect(block.at(-1)).toMatchObject({
      name: "state",
      children: [{ name: "title", type: "String!" }],
    });
    const event = documentEventTree([{ name: "name", type: "String!" }]);
    const action = event.find((node) => node.name === "action");
    expect(action?.children?.find((n) => n.name === "input")).toMatchObject({
      children: [{ name: "name", type: "String!" }],
    });
  });
});
