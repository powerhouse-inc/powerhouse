import { describe, expect, expectTypeOf, it } from "vitest";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import {
  createEntryBuilders,
  isRegisteredEntry,
  readEntry,
} from "../../src/definition/subgraph/entries.js";
import type {
  OutputObjectWithComputed,
  SourceObjectWithComputed,
} from "../../src/definition/subgraph/types.js";

/**
 * The typed subgraph declaration surface.
 *
 * Two properties carry the design. A computed field is in the completed
 * result and never in the backing source, which is what lets a resolver
 * return the row it has rather than a row plus everything downstream will
 * compute. And an entry exists only because a builder made it — nothing is
 * discovered, so an unreturned resolver is unbound and says so.
 */

const Author = ph.object("Author", {
  fields: { id: ph.OID({ required: true }), name: ph.String() },
});

const Post = ph.object("Post", {
  fields: {
    id: ph.OID({ required: true }),
    title: ph.String({ required: true }),
    // Supplied by a resolver, not by the row.
    wordCount: ph.field({ returns: ph.Int({ required: true }) }),
    author: ph.field({
      args: { includeDrafts: ph.Boolean() },
      returns: ph.ref(Author, { required: true }),
      description: "The post's author.",
    }),
  },
});

describe("ph.field", () => {
  it("keeps computed members out of the stored fields", () => {
    // Every existing reader of `fields` sees exactly what it saw before.
    expect(Object.keys(Post.fields)).toEqual(["id", "title"]);
    expect(Object.keys(Post.computed ?? {})).toEqual(["wordCount", "author"]);
  });

  it("exposes a stable token per computed member", () => {
    const tokens = Post.computedTokens as Record<
      string,
      { typeName: string; fieldName: string; kind: string }
    >;
    expect(tokens.wordCount).toEqual({
      kind: "computed-token",
      typeName: "Post",
      fieldName: "wordCount",
    });
    // Present on every object, so a typo is a compile error rather than a
    // read of undefined.
    expect(Author.computedTokens).toEqual({});
  });

  it("refuses a computed member in an input object", () => {
    // Dropping it silently would produce an input missing a field its author
    // wrote, and there is nothing for a resolver to compute on an input.
    expect(() =>
      // No cast: an input object's option type stays narrow, so this is a
      // compile error too — the runtime refusal is the second line of defence.
      ph.input("BadInput", {
        fields: { computed: ph.field({ returns: ph.Int() }) } as never,
      }),
    ).toThrow(DocumentModelDefinitionError);
  });

  it("refuses a computed field that declares no return type", () => {
    expect(() => ph.field({} as never)).toThrow(DocumentModelDefinitionError);
  });
});

describe("output and backing shapes", () => {
  type Members = {
    id: ReturnType<typeof ph.OID<true>>;
    title: ReturnType<typeof ph.String<true>>;
    wordCount: ReturnType<
      typeof ph.field<Record<string, never>, ReturnType<typeof ph.Int<true>>>
    >;
  };

  it("puts a computed member in the output and leaves it out of the source", () => {
    type Output = OutputObjectWithComputed<Members>;
    type Source = SourceObjectWithComputed<Members>;
    expectTypeOf<Output>().toHaveProperty("wordCount");
    expectTypeOf<Source>().not.toHaveProperty("wordCount");
    // The stored members are in both.
    expectTypeOf<Output>().toHaveProperty("title");
    expectTypeOf<Source>().toHaveProperty("title");
  });
});

describe("the entry builders", () => {
  function builders() {
    return createEntryBuilders<
      { name: string },
      { user: string },
      unknown,
      unknown
    >();
  }

  it("registers a query with its arguments and return type", () => {
    const { builders: build } = builders();
    const entry = build.query("post", {
      args: { id: ph.OID({ required: true }) },
      returns: ph.ref(Post),
      resolve: () => ({ id: "p1", title: "One" }),
    });
    expect(isRegisteredEntry(entry)).toBe(true);
    const read = readEntry(entry, ["entries", 0]);
    expect(read.kind).toBe("query");
    if (read.kind !== "query") throw new Error("unreachable");
    expect(read.key).toBe("post");
    expect(read.fieldName).toBe("post");
    expect(Object.keys(read.args)).toEqual(["id"]);
  });

  it("lets a GraphQL field name differ from the author's key", () => {
    const { builders: build } = builders();
    const read = readEntry(
      build.query("postById", {
        fieldName: "post",
        returns: ph.ref(Post),
        resolve: () => ({ id: "p1", title: "One" }),
      }),
      ["entries", 0],
    );
    if (read.kind !== "query") throw new Error("unreachable");
    expect([read.key, read.fieldName]).toEqual(["postById", "post"]);
  });

  it("requires resolve on a query and subscribe on a subscription", () => {
    const { builders: build } = builders();
    expect(() =>
      build.query("post", { returns: ph.ref(Post) } as never),
    ).toThrow(DocumentModelDefinitionError);
    expect(() =>
      build.subscription("posted", { returns: ph.ref(Post) } as never),
    ).toThrow(DocumentModelDefinitionError);
  });

  it("accepts a subscription whose event differs from its result", () => {
    const { builders: build } = builders();
    const read = readEntry(
      build.subscription("posted", {
        returns: ph.ref(Post, { required: true }),
        subscribe: () => (async function* () {})(),
        resolve: ({ parent }) => parent as { id: string; title: string },
      }),
      ["entries", 0],
    );
    if (read.kind !== "subscription") throw new Error("unreachable");
    expect(typeof read.subscribe).toBe("function");
    expect(typeof read.resolve).toBe("function");
  });

  it("keeps GraphQL's default event lookup when resolve is absent", () => {
    const { builders: build } = builders();
    const read = readEntry(
      build.subscription("posted", {
        returns: ph.ref(Post, { required: true }),
        subscribe: () => (async function* () {})(),
      }),
      ["entries", 0],
    );
    if (read.kind !== "subscription") throw new Error("unreachable");
    expect(read.resolve).toBeUndefined();
  });

  it("binds a computed field through its token, not a string", () => {
    const { builders: build } = builders();
    const tokens = Post.computedTokens as Record<string, never>;
    const read = readEntry(
      build.field(tokens.wordCount, { resolve: () => 12 }),
      ["entries", 0],
    );
    expect(read.kind).toBe("computed-field");
    expect(() =>
      build.field("Post.wordCount" as never, { resolve: () => 12 }),
    ).toThrow(DocumentModelDefinitionError);
  });

  it("records abstract-type resolvers against their type", () => {
    const Node = ph.interface("Node", {
      fields: { id: ph.OID({ required: true }) },
    });
    const { builders: build } = builders();
    const resolved = readEntry(
      build.resolveType(Node, () => "Post"),
      ["entries", 0],
    );
    expect(resolved).toMatchObject({ kind: "resolve-type", typeName: "Node" });
    const isType = readEntry(
      build.isTypeOf(Post, () => true),
      ["entries", 1],
    );
    expect(isType).toMatchObject({ kind: "is-type-of", typeName: "Post" });
  });

  it("preserves expose call and argument order", () => {
    const { builders: build, exposed } = builders();
    build.expose(Author, Post);
    build.expose(Post);
    expect(exposed.map((type) => type.name)).toEqual([
      "Author",
      "Post",
      "Post",
    ]);
  });

  it("refuses a forged entry at the boundary", () => {
    // An object that merely looks like an entry would bind a resolver the
    // builders never checked.
    expect(() =>
      readEntry({ kind: "query", key: "post" }, ["entries", 0]),
    ).toThrow(DocumentModelDefinitionError);
    expect(isRegisteredEntry({ kind: "query" })).toBe(false);
  });

  it("freezes what it returns", () => {
    const { builders: build } = builders();
    const entry = build.query("post", {
      returns: ph.ref(Post),
      resolve: () => ({ id: "p1", title: "One" }),
    });
    expect(Object.isFrozen(entry)).toBe(true);
  });
});
