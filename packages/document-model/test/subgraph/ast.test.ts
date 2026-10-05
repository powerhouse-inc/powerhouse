import { print } from "graphql";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/definition/primitives.js";
import { ph } from "../../src/definition/field.js";
import { z } from "zod";
import { defineScalar } from "../../src/definition/scalars/define-scalar.js";
import { compileSubgraphSchema } from "../../src/definition/subgraph/ast.js";
import { createEntryBuilders } from "../../src/definition/subgraph/entries.js";
import { checkSubgraphDefinitionShape } from "../../src/definition/subgraph/wire-shape.js";

/**
 * Descriptors to an author AST.
 *
 * The golden is the point: a subgraph's printed schema is what clients read,
 * so definition order, field order, argument order, enum order and union
 * member order are all part of the contract rather than incidental output.
 */

const GOLDENS = join(dirname(fileURLToPath(import.meta.url)), "goldens");

function golden(name: string): string {
  return readFileSync(join(GOLDENS, name), "utf8");
}

/** A declaration covering every supported form. */
function buildEverything(definitionOrder?: readonly string[]) {
  const Visibility = ph.enum("Visibility", {
    values: ["PUBLIC", "PRIVATE"],
    description: "Who can see it.",
  });

  const Node = ph.interface("Node", {
    fields: { id: ph.OID({ required: true }) },
  });

  const Tag = ph.object("Tag", {
    fields: { label: ph.String({ required: true }) },
  });

  const Filter = ph.input("Filter", {
    fields: {
      visibility: ph.ref(Visibility, { defaultValue: "PUBLIC" }),
      limit: ph.Int({ defaultValue: 10 }),
      // Declared `= null`, which is a different schema from no default.
      cursor: ph.String({ defaultValue: null }),
    },
  });

  const Folder = ph.object("Folder", {
    implements: [Node],
    fields: {
      id: ph.OID({ required: true }),
      name: ph.String({ required: true, description: "Its name." }),
      visibility: ph.ref(Visibility, { required: true }),
      tags: ph.list(ph.ref(Tag, { required: true })),
      legacyName: ph.String({ deprecated: "Use name." }),
      // Supplied by a resolver, not by the row.
      childCount: ph.field({
        args: { filter: ph.ref(Filter) },
        returns: ph.Int({ required: true }),
        description: "How many children match.",
      }),
    },
  });

  const Entry = ph.union("Entry", {
    members: [Folder, Tag],
    description: "Anything a drive holds.",
  });

  const { builders, exposed } = createEntryBuilders<
    unknown,
    unknown,
    unknown,
    unknown
  >();
  const entries = [
    builders.query("folder", {
      args: { id: ph.OID({ required: true }), filter: ph.ref(Filter) },
      returns: ph.ref(Folder),
      description: "One folder.",
      resolve: () => null,
    }),
    builders.query("entries", {
      returns: ph.list(ph.ref(Entry, { required: true }), { required: true }),
      resolve: () => [],
    }),
    builders.mutation("rename", {
      args: {
        id: ph.OID({ required: true }),
        name: ph.String({ required: true }),
      },
      returns: ph.ref(Folder, { required: true }),
      resolve: () => ({
        id: "f",
        name: "n",
        visibility: "PUBLIC" as const,
        tags: null,
        legacyName: null,
      }),
    }),
    builders.subscription("folderChanged", {
      args: { id: ph.OID({ required: true }) },
      returns: ph.ref(Folder, { required: true }),
      subscribe: () => (async function* () {})(),
    }),
    builders.field(
      (Folder.computedTokens as Record<string, never>).childCount,
      { resolve: () => 0 },
    ),
    builders.resolveType(Entry, () => "Folder"),
    builders.isTypeOf(Folder, () => true),
  ];
  builders.expose(Node);
  return compileSubgraphSchema({
    name: "everything",
    entries,
    exposed,
    ...(definitionOrder !== undefined && { definitionOrder }),
  });
}

describe("the author AST", () => {
  const compiled = buildEverything();

  it("compiles every supported form without a diagnostic", () => {
    expect(compiled.diagnostics).toEqual([]);
  });

  it("prints to the committed golden", () => {
    const printed = print(compiled.document as never);
    if (process.env.UPDATE_SUBGRAPH_GOLDEN === "1") {
      writeFileSync(join(GOLDENS, "everything.graphql"), printed);
    }
    expect(printed).toBe(golden("everything.graphql"));
  });

  it("orders scalars in catalog order, types in traversal order, roots last", () => {
    // Arguments before returns, which is why `Filter` — reached from the
    // `folder` query's argument — precedes `Folder`, reached from its return.
    // `Node` follows `Folder` because an object's interfaces are visited
    // before its fields, and `Tag` arrives through `Folder.tags`.
    expect(compiled.definitionOrder).toEqual([
      "OID",
      "Filter",
      "Visibility",
      "Folder",
      "Node",
      "Tag",
      "Entry",
      "Query",
      "Mutation",
      "Subscription",
    ]);
  });

  it("is location-free and canonicalizable", () => {
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node === null || typeof node !== "object") return;
      expect(Object.keys(node)).not.toContain("loc");
      Object.values(node).forEach(walk);
    };
    walk(compiled.document);
    expect(() => canonicalJson(compiled.document)).not.toThrow();
  });

  it("produces identical bytes on a second walk", () => {
    // Nothing about the output may depend on iteration luck or a cache.
    expect(canonicalJson(buildEverything().document)).toBe(
      canonicalJson(compiled.document),
    );
  });

  it("derives hasSubscriptions from the declaration", () => {
    expect(compiled.hasSubscriptions).toBe(true);
  });

  it("records every entry, with the manual marker the wire requires", () => {
    expect(compiled.entries.map((entry) => entry.kind)).toEqual([
      "query",
      "query",
      "mutation",
      "subscription",
      "computed-field",
      "resolve-type",
      "is-type-of",
    ]);
    expect(
      compiled.entries.every((entry) => entry.access.kind === "manual"),
    ).toBe(true);
  });

  it("names the catalog scalars it used, in catalog order", () => {
    expect(compiled.scalars).toEqual([
      {
        name: "OID",
        implementation: "powerhouse.catalog#OID",
        graphQLProfile: "legacy-graphql-default-v1",
      },
    ]);
  });
});

describe("default values", () => {
  it("lower by the declared type, not by the JavaScript value", () => {
    const printed = print(buildEverything().document as never);
    // A string default on an enum-typed field is an EnumValue; the same
    // string elsewhere would print with quotes.
    expect(printed).toContain("visibility: Visibility = PUBLIC");
    expect(printed).toContain("limit: Int = 10");
    // Declared `= null`: a different schema from no default at all.
    expect(printed).toContain("cursor: String = null");
  });

  it("distinguish an absent default from an explicit null", () => {
    const compiled = buildEverything();
    const filter = compiled.types.find((type) => type.name === "Filter");
    if (filter?.kind !== "input") throw new Error("unreachable");
    const cursor = filter.fields.find((field) => field.name === "cursor");
    expect(cursor && "defaultValue" in cursor).toBe(true);
    expect(cursor?.defaultValue).toBeNull();

    const folder = compiled.types.find((type) => type.name === "Query");
    if (folder?.kind !== "object") throw new Error("unreachable");
    const id = folder.fields[0].args?.[0];
    expect(id && "defaultValue" in id).toBe(false);
  });
});

describe("an explicit definition order", () => {
  it("is used when it is a complete permutation", () => {
    // Authored order is a compatibility property: a subgraph whose existing
    // schema puts Query first keeps it there.
    const order = [
      "Query",
      "Mutation",
      "Subscription",
      "OID",
      "Filter",
      "Visibility",
      "Folder",
      "Node",
      "Tag",
      "Entry",
    ];
    const compiled = buildEverything(order);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.definitionOrder).toEqual(order);
    const printed = print(compiled.document as never);
    if (process.env.UPDATE_SUBGRAPH_GOLDEN === "1") {
      writeFileSync(join(GOLDENS, "everything.query-first.graphql"), printed);
    }
    expect(printed).toBe(golden("everything.query-first.graphql"));
  });

  it.each([
    [["Query"], "omits"],
    [
      [
        "Query",
        "Mutation",
        "Subscription",
        "OID",
        "Filter",
        "Visibility",
        "Folder",
        "Node",
        "Tag",
        "Entry",
        "Invented",
      ],
      "does not emit",
    ],
    [
      [
        "Query",
        "Query",
        "Mutation",
        "Subscription",
        "OID",
        "Filter",
        "Visibility",
        "Folder",
        "Node",
      ],
      "twice",
    ],
  ])("rejects an invalid permutation (%#)", (order, reason) => {
    const compiled = buildEverything(order as readonly string[]);
    expect(compiled.diagnostics.length).toBeGreaterThan(0);
    expect(
      compiled.diagnostics.some((entry) => entry.message.includes(reason)),
    ).toBe(true);
  });
});

describe("computed-field bindings", () => {
  function compileWith(bind: "none" | "twice" | "unreachable") {
    const Thing = ph.object("Thing", {
      fields: {
        id: ph.OID({ required: true }),
        size: ph.field({ returns: ph.Int({ required: true }) }),
      },
    });
    const { builders, exposed } = createEntryBuilders<
      unknown,
      unknown,
      unknown,
      unknown
    >();
    const token = (Thing.computedTokens as Record<string, never>).size;
    const entries = [
      builders.query("thing", {
        returns: ph.ref(Thing),
        resolve: () => null,
      }),
      ...(bind === "none" ? [] : [builders.field(token, { resolve: () => 1 })]),
      ...(bind === "twice"
        ? [builders.field(token, { resolve: () => 1 })]
        : []),
    ];
    if (bind === "unreachable") {
      const Other = ph.object("Other", {
        fields: {
          id: ph.OID({ required: true }),
          hidden: ph.field({ returns: ph.Int({ required: true }) }),
        },
      });
      entries.push(
        builders.field((Other.computedTokens as Record<string, never>).hidden, {
          resolve: () => 1,
        }),
      );
    }
    return compileSubgraphSchema({ name: "bindings", entries, exposed });
  }

  it("reports a computed field nothing binds", () => {
    expect(
      compileWith("none").diagnostics.map((entry) => entry.message),
    ).toEqual(["Computed field Thing.size has no binding."]);
  });

  it("reports a computed field bound twice", () => {
    expect(
      compileWith("twice").diagnostics.map((entry) => entry.message),
    ).toEqual(["Computed field Thing.size is bound twice."]);
  });

  it("reports a binding whose type nothing reaches", () => {
    expect(
      compileWith("unreachable").diagnostics.map((entry) => entry.message),
    ).toEqual([
      "Computed field Other.hidden is bound, but no reachable type declares it.",
    ]);
  });
});

describe("a package scalar", () => {
  const HexColor = defineScalar({
    name: "HexColor",
    description: "A six-digit hexadecimal color, such as #1a2b3c.",
    representation: "string",
    validator: z.string().regex(/^#[0-9a-f]{6}$/i),
    zodSource: "z.string().regex(/^#[0-9a-f]{6}$/i)",
  });

  function compile() {
    const { builders, exposed } = createEntryBuilders();
    const Swatch = ph.object("Swatch", {
      fields: { id: ph.OID({ required: true }), color: HexColor() },
    });
    return compileSubgraphSchema({
      name: "swatches",
      entries: [
        builders.query("swatch", {
          args: { color: HexColor({ required: true }) },
          returns: ph.ref(Swatch),
          resolve: () => null,
        }),
      ],
      exposed,
    });
  }

  it("is declared by the subgraph with its description and its definition", () => {
    const compiled = compile();
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.scalars).toEqual([
      {
        name: "OID",
        implementation: "powerhouse.catalog#OID",
        graphQLProfile: "legacy-graphql-default-v1",
      },
      {
        name: "HexColor",
        implementation: "package#HexColor",
        graphQLProfile: "declared-coercion-v1",
        definition: HexColor.definition,
      },
    ]);
    expect(compiled.packageScalars).toEqual([HexColor.binding]);
    expect(compiled.definitionOrder).toEqual([
      "OID",
      "HexColor",
      "Swatch",
      "Query",
    ]);
    const printed = print(compiled.document as never);
    expect(printed).toContain(
      '"""A six-digit hexadecimal color, such as #1a2b3c."""\nscalar HexColor',
    );
    expect(printed).toContain("swatch(color: HexColor!): Swatch");
  });

  it("passes the wire-shape check the host and checker share", () => {
    const compiled = compile();
    const definition = {
      kind: "powerhouse.subgraph",
      formatVersion: 1,
      name: "swatches",
      compositionPolicy: "host-current",
      federationProfile: "host-current",
      schemaKind: "typed",
      hasSubscriptions: false,
      types: compiled.types,
      entries: compiled.entries,
      scalars: compiled.scalars,
      definitionOrder: compiled.definitionOrder,
    };
    expect(checkSubgraphDefinitionShape(definition)).toEqual([]);

    const renamed = {
      ...definition,
      scalars: definition.scalars.map((scalar) =>
        "definition" in scalar ? { ...scalar, name: "PHID" } : scalar,
      ),
    };
    expect(
      checkSubgraphDefinitionShape(renamed).map((entry) => entry.path),
    ).toContainEqual(["definition", "scalars", "1", "name"]);
  });
});
