import { describe, expect, it } from "vitest";
import {
  schemaGraph,
  type SchemaGraph,
} from "../src/build/models/schema-graph.js";
import { laidOut, matches, styled } from "../src/build/models/schema-layout.js";

function graph(sdl: string): SchemaGraph {
  const result = schemaGraph(sdl);
  if (!result.ok) throw new Error(result.message);
  return result.graph;
}

const fields = (count: number, last: string) =>
  [
    ...Array.from({ length: count - 1 }, (_, i) => `  f${i}: String`),
    `  last: ${last}`,
  ].join("\n");

describe("laidOut", () => {
  it("leaves from the member's handle and arrives at the declaration's", () => {
    const { edges } = laidOut(
      graph(
        "type Invoice {\n  id: ID!\n  payer: Party!\n}\ntype Party { name: String }",
      ),
      new Set(),
    );
    expect(
      edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle]),
    ).toEqual([["Invoice", "m1", "Party", "in"]]);
  });

  it("leaves from the +N more row while the member is hidden, and from the member once shown", () => {
    const sdl = `type Big {\n${fields(20, "Small")}\n}\ntype Small { x: Int }`;
    const collapsed = laidOut(graph(sdl), new Set());
    const big = collapsed.nodes.find((n) => n.id === "Big")!;
    expect(big.data.rows).toHaveLength(16);
    expect(big.data.hidden).toBe(4);
    expect(big.data.hasMoreHandle).toBe(true);
    expect(collapsed.edges[0].sourceHandle).toBe("more");

    const open = laidOut(graph(sdl), new Set(["Big"]));
    expect(open.nodes.find((n) => n.id === "Big")!.data.rows).toHaveLength(20);
    expect(open.edges[0].sourceHandle).toBe("m19");
    expect(open.nodes.find((n) => n.id === "Big")!.height).toBeGreaterThan(
      big.height!,
    );
  });

  it("leaves from the header for an interface it implements", () => {
    const { edges, nodes } = laidOut(
      graph(
        "interface Node { id: ID! }\ntype Note implements Node { id: ID! }",
      ),
      new Set(),
    );
    expect(edges[0]).toMatchObject({
      source: "Note",
      sourceHandle: "head",
      target: "Node",
    });
    expect(nodes.find((n) => n.id === "Note")!.data.hasHeadHandle).toBe(true);
  });

  it("lays out left to right, from the declaration nothing points at", () => {
    const { nodes, root } = laidOut(
      graph(
        "type Leaf { x: Int }\ntype State { a: Mid }\ntype Mid { b: Leaf }",
      ),
      new Set(),
    );
    expect(root.id).toBe("State");
    const x = (id: string) => nodes.find((n) => n.id === id)!.position.x;
    expect(x("State")).toBeLessThan(x("Mid"));
    expect(x("Mid")).toBeLessThan(x("Leaf"));
  });

  it("knows each declaration's neighbourhood: itself and its links both ways", () => {
    const { neighbourhood } = laidOut(
      graph("type A { b: B }\ntype B { c: C }\ntype C { x: Int }"),
      new Set(),
    );
    expect([...neighbourhood.get("B")!].sort()).toEqual(["A", "B", "C"]);
    expect([...neighbourhood.get("A")!].sort()).toEqual(["A", "B"]);
  });
});

describe("styled", () => {
  const { edges } = laidOut(
    graph("type A { b: B\n c: C }\ntype B { x: Int }\ntype C { x: Int }"),
    new Set(),
  );

  it("lights the edges that touch the focus and fades the rest", () => {
    const lit = styled(edges, "B");
    const toB = lit.find((e) => e.target === "B")!;
    const toC = lit.find((e) => e.target === "C")!;
    expect(toB.style).toMatchObject({
      stroke: "var(--primary)",
      strokeOpacity: 0.95,
    });
    expect(toC.style).toMatchObject({
      stroke: "var(--muted-foreground)",
      strokeOpacity: 0.12,
    });
  });

  it("draws every edge alike without a focus", () => {
    const plain = styled(edges, null);
    expect(new Set(plain.map((e) => e.style?.strokeOpacity))).toEqual(
      new Set([0.58]),
    );
  });
});

describe("matches", () => {
  const g = graph(
    "type Bank {\n  accountNum: String!\n  accountType: AccountType\n}\nenum AccountType { CHECKING SAVINGS }",
  );

  const names = (query: string) => {
    const found = matches(g, query);
    return {
      declarations: found.declarations.map((d) => d.name),
      members: found.members.map(
        ({ declaration, member }) => `${declaration.name}.${member.label}`,
      ),
    };
  };

  it("finds declarations and members by part of their name, ignoring case", () => {
    expect(names("account")).toEqual({
      declarations: ["AccountType"],
      members: ["Bank.accountNum", "Bank.accountType"],
    });
    expect(names("savings")).toEqual({
      declarations: [],
      members: ["AccountType.SAVINGS"],
    });
  });

  it("lists every declaration for a blank query", () => {
    expect(names("  ")).toEqual({
      declarations: ["Bank", "AccountType"],
      members: [],
    });
  });
});

describe("laidOut with names an object already has", () => {
  for (const name of [
    "constructor",
    "toString",
    "hasOwnProperty",
    "__proto__",
  ]) {
    it(`lays out a type named ${name}`, () => {
      const { nodes } = laidOut(
        graph(`type A { b: ${name} }\ntype ${name} { x: String a: A }`),
        new Set(),
      );
      expect(nodes.map((n) => n.id)).toEqual(["A", name]);
      for (const node of nodes) {
        expect(Number.isFinite(node.position.x)).toBe(true);
        expect(Number.isFinite(node.position.y)).toBe(true);
      }
    });
  }
});
