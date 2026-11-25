import { describe, expect, it } from "vitest";
import {
  SCHEMA_GRAPH_LIMITS,
  schemaGraph,
  type SchemaGraph,
} from "../src/panels/models/schema/schema-graph.js";

function graph(sdl: string): SchemaGraph {
  const result = schemaGraph(sdl);
  if (!result.ok) throw new Error(result.message);
  return result.graph;
}

const INVOICE = `
type InvoiceState {
  number: String
  status: InvoiceStatus!
  issuer: LegalEntity!
  payer: LegalEntity!
  items: [LineItem!]!
}

enum InvoiceStatus {
  DRAFT
  PAID
}

type LegalEntity {
  name: String
  address: Address
}

type LineItem {
  id: OID!
  billedTo: Address
}

type Address {
  city: String
}
`;

describe("schemaGraph", () => {
  it("lists each declaration with its members as written", () => {
    const { declarations } = graph(INVOICE);
    expect(declarations.map((d) => `${d.kind} ${d.name}`)).toEqual([
      "type InvoiceState",
      "enum InvoiceStatus",
      "type LegalEntity",
      "type LineItem",
      "type Address",
    ]);
    expect(declarations[0].members).toEqual([
      { kind: "field", label: "number", type: "String", typeDeclaration: null },
      {
        kind: "field",
        label: "status",
        type: "InvoiceStatus!",
        typeDeclaration: "InvoiceStatus",
      },
      {
        kind: "field",
        label: "issuer",
        type: "LegalEntity!",
        typeDeclaration: "LegalEntity",
      },
      {
        kind: "field",
        label: "payer",
        type: "LegalEntity!",
        typeDeclaration: "LegalEntity",
      },
      {
        kind: "field",
        label: "items",
        type: "[LineItem!]!",
        typeDeclaration: "LineItem",
      },
    ]);
    expect(declarations[1].members).toEqual([
      { kind: "value", label: "DRAFT" },
      { kind: "value", label: "PAID" },
    ]);
  });

  it("links from the member whose type is declared, and counts each pair of declarations once", () => {
    const result = graph(INVOICE);
    expect(result.links).toEqual([
      { source: "InvoiceState", target: "InvoiceStatus", member: 1 },
      { source: "InvoiceState", target: "LegalEntity", member: 2 },
      { source: "InvoiceState", target: "LegalEntity", member: 3 },
      { source: "InvoiceState", target: "LineItem", member: 4 },
      { source: "LegalEntity", target: "Address", member: 1 },
      { source: "LineItem", target: "Address", member: 1 },
    ]);
    expect(result.linkedPairs).toBe(5);
  });

  it("does not link to scalars the schema does not declare", () => {
    const result = graph("type A {\n  id: OID!\n  at: DateTime\n}");
    expect(result.links).toEqual([]);
    expect(result.declarations[0].members).toEqual([
      { kind: "field", label: "id", type: "OID!", typeDeclaration: null },
      { kind: "field", label: "at", type: "DateTime", typeDeclaration: null },
    ]);
  });

  it("links arguments, interfaces and union members", () => {
    const result = graph(`
      interface Node { id: ID! }
      type Query implements Node {
        id: ID!
        search(filter: Filter, first: Int, after: String): [Result!]!
      }
      input Filter { text: String }
      union Result = Note | Task
      type Note { body: String }
      type Task { done: Boolean }
    `);
    const query = result.declarations.find((d) => d.name === "Query")!;
    expect(query.members[1]).toEqual({
      kind: "field",
      label: "search(filter, first, …)",
      type: "[Result!]!",
      typeDeclaration: "Result",
    });
    expect(
      result.declarations.find((d) => d.name === "Result")!.members,
    ).toEqual([
      { kind: "member", label: "Note", typeDeclaration: "Note" },
      { kind: "member", label: "Task", typeDeclaration: "Task" },
    ]);
    expect(result.links).toEqual(
      expect.arrayContaining([
        { source: "Query", target: "Result", member: 1 },
        { source: "Query", target: "Filter", member: 1 },
        { source: "Query", target: "Node", member: "implements" },
        { source: "Result", target: "Note", member: 0 },
        { source: "Result", target: "Task", member: 1 },
      ]),
    );
  });

  it("names only a field's own type as its declaration, not its arguments'", () => {
    const result = graph(
      "type A {\n  tags(filter: Filter): [String]\n}\ninput Filter { q: String }",
    );
    expect(result.declarations[0].members[0]).toMatchObject({
      typeDeclaration: null,
    });
    expect(result.links).toEqual([
      { source: "A", target: "Filter", member: 0 },
    ]);
  });

  it("merges an extension into the declaration it extends", () => {
    const result = graph(
      "type A { x: Int }\nextend type A { y: B }\ntype B { z: Int }",
    );
    expect(result.declarations.map((d) => d.name)).toEqual(["A", "B"]);
    expect(result.declarations[0].members.map((m) => m.label)).toEqual([
      "x",
      "y",
    ]);
    expect(result.links).toEqual([{ source: "A", target: "B", member: 1 }]);
  });

  it("keeps a self-reference", () => {
    const result = graph("type Folder {\n  parent: Folder\n}");
    expect(result.links).toEqual([
      { source: "Folder", target: "Folder", member: 0 },
    ]);
  });

  it("reports a schema that does not parse, with GraphQL's message", () => {
    const result = schemaGraph("type A {\n  b C\n}");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid");
    expect(result.message).toContain("Syntax Error");
  });

  it("refuses a schema past the size it draws", () => {
    const result = schemaGraph(
      " ".repeat(SCHEMA_GRAPH_LIMITS.sourceCharacters + 1),
    );
    expect(result).toMatchObject({ ok: false, reason: "too_large" });
  });

  it("draws at most the declaration limit, and says how many it left out", () => {
    const many = Array.from(
      { length: SCHEMA_GRAPH_LIMITS.declarations + 3 },
      (_, i) => `type T${i} { next: T${i + 1} }`,
    ).join("\n");
    const result = graph(many);
    expect(result.declarations).toHaveLength(SCHEMA_GRAPH_LIMITS.declarations);
    expect(result.omittedDeclarations).toBe(3);
    const last = `T${SCHEMA_GRAPH_LIMITS.declarations - 1}`;
    expect(result.links.some((l) => l.source === last)).toBe(false);
  });

  it("calls a schema past the token limit too large, not invalid", () => {
    const fields = Array.from({ length: 30_000 }, (_, i) => `  f${i}: S`);
    const result = schemaGraph(`type A {\n${fields.join("\n")}\n}`);
    expect(result).toMatchObject({ ok: false, reason: "too_large" });
  });

  it("counts the links to declarations past the limit as left out", () => {
    const shown = SCHEMA_GRAPH_LIMITS.declarations;
    const sdl = [
      `type Root { far: T${shown - 1} }`,
      ...Array.from({ length: shown }, (_, i) => `type T${i} { x: Int }`),
    ].join("\n");
    const result = graph(sdl);
    expect(result.omittedDeclarations).toBe(1);
    expect(result.omittedLinks).toBe(1);
    expect(result.declarations[0].members[0]).toMatchObject({
      typeDeclaration: null,
    });
  });

  it("gives nothing to draw for a schema with only a schema definition", () => {
    expect(graph("schema { query: Query }").declarations).toEqual([]);
  });
});
