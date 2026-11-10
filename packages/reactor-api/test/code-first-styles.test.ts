/**
 * Which path a subgraph class takes, decided per class: a class that
 * inherits `Subgraph`'s protocol symbol is code first, and every other
 * class takes the schema-first path with no new code. Each refusal is pinned with
 * the message the host reports.
 */
import { buildSubgraphSchema } from "@apollo/subgraph";
import { ph, readSubgraphProtocol, SUBGRAPH_PROTOCOL } from "document-model";
import { graphql, type ObjectTypeDefinitionNode, parse, print } from "graphql";
import { gql } from "graphql-tag";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { transformWithOxc } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { CodeFirstSubgraphError } from "../src/graphql/code-first/errors.js";
import { defineIndexSubgraph } from "../src/graphql/index-subgraph.js";
import type { SchemaBuilder } from "../src/graphql/code-first/schema-builder.js";
import { Subgraph } from "../src/graphql/code-first/subgraph.js";
import type { SubgraphArgs, SubgraphClass } from "../src/graphql/types.js";
import { extractSubgraphs } from "../src/packages/subgraph-extraction.js";
import {
  type CodeFirstHost,
  startCodeFirstHost,
} from "./utils/code-first-host.js";

const PING = "{ ping }";

const pingTypeDefs = gql`
  type Query {
    ping: String
  }
`;

// Schema-first classes whose statics happen to use the code-first names.
class SchemaFirstNamed extends BaseSubgraph {
  static subgraphName = "metadata";
  override name = "schema-first-named";
  override typeDefs = pingTypeDefs;
  override resolvers = { Query: { ping: () => "schema-first-named" } };
}

class SchemaFirstGetSchema extends BaseSubgraph {
  static getSchema() {
    return "not entries";
  }
  override name = "schema-first-get-schema";
  override typeDefs = pingTypeDefs;
  override resolvers = { Query: { ping: () => "schema-first-get-schema" } };
}

class SchemaFirstStaticsBase extends BaseSubgraph {
  static subgraphName = "inherited";
  static getSchema() {
    return [];
  }
}
class SchemaFirstInherited extends SchemaFirstStaticsBase {
  override name = "schema-first-inherited";
  override typeDefs = pingTypeDefs;
  override resolvers = { Query: { ping: () => "schema-first-inherited" } };
}

class SchemaFirstGetters extends BaseSubgraph {
  static get subgraphName() {
    return "from-a-getter";
  }
  override name = "schema-first-getters";
  override typeDefs = pingTypeDefs;
  override resolvers = { Query: { ping: () => "schema-first-getters" } };
}

const SCHEMA_FIRST: readonly [SubgraphClass, string][] = [
  [SchemaFirstNamed, "schema-first-named"],
  [SchemaFirstGetSchema, "schema-first-get-schema"],
  [SchemaFirstInherited, "schema-first-inherited"],
  [SchemaFirstGetters, "schema-first-getters"],
];

const pingEntry = (schema: SchemaBuilder<Subgraph>, value: string) =>
  schema.query("ping", { type: ph.String(), resolve: () => value });

class CodeFirstBase extends Subgraph {}

class CodeFirstChild extends CodeFirstBase {
  static override readonly subgraphName = "child";
  static override getSchema(schema: SchemaBuilder<CodeFirstChild>) {
    return [pingEntry(schema, "child")];
  }
}

class NotKebab extends Subgraph {
  static override readonly subgraphName = "Not_Kebab";
  static override getSchema(schema: SchemaBuilder<NotKebab>) {
    return [pingEntry(schema, "x")];
  }
}

class MissingResolver extends Subgraph {
  static override readonly subgraphName = "missing-resolver";
  static override getSchema(schema: SchemaBuilder<MissingResolver>) {
    return [
      schema.query("ping", {
        type: ph.String(),
        resolve: undefined as unknown as () => string,
      }),
    ];
  }
}

class Throwing extends Subgraph {
  static override readonly subgraphName = "throwing";
  static override getSchema(): never {
    throw new Error("no database configured");
  }
}

class Initializer extends Subgraph {
  static override readonly subgraphName = "initializer";
  static override getSchema(schema: SchemaBuilder<Initializer>) {
    return [pingEntry(schema, "x")];
  }
  override typeDefs = parse("type Query { other: String }");
}

class ConstructorAssignment extends Subgraph {
  static override readonly subgraphName = "constructor-assignment";
  static override getSchema(schema: SchemaBuilder<ConstructorAssignment>) {
    return [pingEntry(schema, "x")];
  }
  constructor(args: SubgraphArgs) {
    super(args);
    this.name = "renamed";
  }
}

class SetupReplaces extends Subgraph {
  static override readonly subgraphName = "setup-replaces";
  static override getSchema(schema: SchemaBuilder<SetupReplaces>) {
    return [pingEntry(schema, "x")];
  }
  override async onSetup() {
    await Promise.resolve();
    this.hasSubscriptions = true;
  }
}

class SetupMutates extends Subgraph {
  static override readonly subgraphName = "setup-mutates";
  static override getSchema(schema: SchemaBuilder<SetupMutates>) {
    return [pingEntry(schema, "x")];
  }
  override async onSetup() {
    await Promise.resolve();
    this.resolvers.Query.ping = () => "patched";
  }
}

class SetupEditsDocument extends Subgraph {
  static override readonly subgraphName = "setup-edits-document";
  static override getSchema(schema: SchemaBuilder<SetupEditsDocument>) {
    return [pingEntry(schema, "pong")];
  }
  override async onSetup() {
    await Promise.resolve();
    const query = this.typeDefs.definitions[0] as ObjectTypeDefinitionNode;
    (query.fields![0].type as { name: { value: string } }).name.value = "Int";
  }
}

class FutureProtocol extends BaseSubgraph {
  static [SUBGRAPH_PROTOCOL] = {
    version: 2,
    describe: () => ({ diagnostics: [] }),
    validate: () => ({ ok: true }),
  };
}

class MalformedProtocol extends BaseSubgraph {
  static [SUBGRAPH_PROTOCOL] = {
    version: 1,
    describe: () => ({ diagnostics: [] }),
  };
}

class NonObjectProtocol extends BaseSubgraph {
  static [SUBGRAPH_PROTOCOL] = "v1";
}

const AFTER_CONSTRUCTION = (field: string) =>
  `\`${field}\` differs from what the Subgraph constructor assigned from getSchema. A code-first subgraph declares its schema in getSchema only; remove the field initializer, field declaration or assignment that sets \`${field}\`.`;

/**
 * A class body compiled with or without define semantics for class fields,
 * as a project's `useDefineForClassFields` chooses.
 */
async function compiledClass(
  source: string,
  useDefineForClassFields: boolean,
): Promise<{ cls: SubgraphClass; code: string }> {
  const { code } = await transformWithOxc(
    `export const make = (Subgraph: any, ph: any) => ${source};`,
    "fixture.ts",
    useDefineForClassFields
      ? {}
      : {
          typescript: { removeClassFieldsWithoutInitializer: true },
          assumptions: { setPublicClassFields: true },
        },
  );
  const dir = await mkdtemp(join(tmpdir(), "code-first-fields-"));
  const file = join(dir, "fixture.mjs");
  await writeFile(file, code);
  try {
    const { make } = (await import(
      /* @vite-ignore */ pathToFileURL(file).href
    )) as { make: (base: typeof Subgraph, dsl: typeof ph) => SubgraphClass };
    return { cls: make(Subgraph, ph), code };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const DECLARED_FIELD = `class Declared extends Subgraph {
  static subgraphName = "declared";
  static getSchema(schema: any) {
    return [schema.query("ping", { type: ph.String(), resolve: () => "declared" })];
  }
  hasSubscriptions: boolean;
}`;

let host: CodeFirstHost | undefined;
afterEach(async () => {
  await host?.close();
  host = undefined;
});

async function start() {
  host = await startCodeFirstHost();
  return host;
}

function loggedFailures(current: CodeFirstHost) {
  return vi
    .mocked(current.logger.error)
    .mock.calls.filter(([template]) =>
      /^Failed to (create|register|restore) subgraph/.test(String(template)),
    )
    .map(([template, name, origin, error]) => ({
      template,
      name,
      origin,
      error:
        error instanceof CodeFirstSubgraphError ? error.message : String(error),
    }));
}

describe("schema-first classes with unrelated statics", () => {
  it.each(SCHEMA_FIRST)("%o takes the schema-first path", (cls) => {
    expect(readSubgraphProtocol(cls)).toEqual({ kind: "schema-first" });
    expect(extractSubgraphs({ cls })).toEqual([cls]);
  });

  it("register directly and from a package, and serve their own resolvers", async () => {
    const current = await start();
    const [direct, ...packaged] = SCHEMA_FIRST;
    await current.manager.registerSubgraph(direct[0], "graphql");
    await current.applyPackage(
      "@acme/schema-first",
      packaged.map(([cls]) => cls),
    );
    for (const [, name] of SCHEMA_FIRST) {
      expect(await current.post(`/graphql/${name}`, PING)).toEqual({
        data: { ping: name },
      });
    }
    expect(loggedFailures(current)).toEqual([]);
  });

  it("serves a defineIndexSubgraph class through the same checks", async () => {
    const Notes = defineIndexSubgraph({
      name: "notes",
      typeDefs: gql`
        type Notes {
          count(driveId: String!): Int!
        }
        type Query {
          notes: Notes!
        }
      `,
      index: (driveId) => ({ driveId }),
      access: {
        scope: { drive: "driveId" },
        fields: { "Notes.count": { public: true } },
      },
      queries: { "Notes.count": ({ db }) => db.driveId.length },
      resolvers: { Query: { notes: () => ({}) } },
    });
    const current = await start();
    await current.applyPackage("@acme/index", [Notes as SubgraphClass]);
    expect(
      await current.post(
        "/graphql/notes",
        '{ notes { count(driveId: "drive-1") } }',
      ),
    ).toEqual({ data: { notes: { count: 7 } } });
  });
});

describe("describe()", () => {
  it("never constructs the class", () => {
    const constructed = vi.fn();
    class NeedsDatabase extends Subgraph {
      static override readonly subgraphName = "needs-database";
      static override getSchema(schema: SchemaBuilder<NeedsDatabase>) {
        return [pingEntry(schema, "x")];
      }
      constructor(args: SubgraphArgs) {
        constructed();
        super(args);
        throw new Error("DATABASE_URL is not set");
      }
    }
    const description = NeedsDatabase[SUBGRAPH_PROTOCOL].describe();
    expect(description.name).toBe("needs-database");
    expect(description.diagnostics).toEqual([]);
    expect(description.definition?.kind).toBe("powerhouse.subgraph");
    expect(constructed).not.toHaveBeenCalled();
    expect(CodeFirstBase[SUBGRAPH_PROTOCOL].describe()).toEqual({
      diagnostics: [],
    });
  });
});

describe("code-first bases", () => {
  it("drops a base that another export extends, at any nesting", () => {
    expect(extractSubgraphs({ CodeFirstBase, CodeFirstChild })).toEqual([
      CodeFirstChild,
    ]);
    expect(
      extractSubgraphs({ child: { CodeFirstBase, CodeFirstChild } }),
    ).toEqual([CodeFirstChild]);
    expect(extractSubgraphs({ Subgraph, CodeFirstChild })).toEqual([
      CodeFirstChild,
    ]);
    expect(extractSubgraphs({ CodeFirstBase })).toEqual([CodeFirstBase]);
  });

  it("cannot be constructed", () => {
    expect(() => new CodeFirstBase({} as SubgraphArgs)).toThrow(
      new CodeFirstSubgraphError(
        "CodeFirstBase cannot be constructed: CodeFirstBase has no static subgraphName",
      ),
    );
  });
});

describe("refused before construction", () => {
  it.each([
    [
      NotKebab,
      "Refusing NotKebab: PH-SG-NAME-INVALID at name: A subgraph name must be lowercase kebab-case. It is the route segment and is never normalized.",
    ],
    [
      MissingResolver,
      'Refusing MissingResolver: PH-SG-RESOLVER-MISSING at entries.0.spec.resolve: query "ping" has no resolve function.',
    ],
    [
      Throwing,
      "Refusing Throwing: PH-SG-ENTRY-INVALID at entries: Throwing.getSchema threw: no database configured",
    ],
    [
      FutureProtocol,
      "Refusing FutureProtocol: it speaks subgraph protocol version 2, but this host supports version 1",
    ],
    [
      MalformedProtocol,
      "Refusing MalformedProtocol: it speaks a malformed subgraph protocol version 1, but this host supports version 1",
    ],
    [
      NonObjectProtocol,
      "Refusing NonObjectProtocol: it speaks subgraph protocol version undefined, but this host supports version 1",
    ],
    [
      CodeFirstBase,
      "Refusing CodeFirstBase: CodeFirstBase has no static subgraphName",
    ],
  ] as const)("%o", async (cls, message) => {
    const current = await start();
    await expect(
      current.manager.registerSubgraph(cls as unknown as SubgraphClass),
    ).rejects.toMatchObject({ name: "CodeFirstSubgraphError", message });
    await current.applyPackage("@acme/refused", [
      cls as unknown as SubgraphClass,
    ]);
    expect(loggedFailures(current)).toEqual([
      {
        template: "Failed to create subgraph @subgraph from @package: @error",
        name: cls.name,
        origin: "@acme/refused",
        error: message,
      },
    ]);
  });
});

describe("refused after construction or setup, naming the field", () => {
  it.each([
    [Initializer, "construction", "typeDefs"],
    [ConstructorAssignment, "construction", "name"],
    [SetupReplaces, "onSetup", "hasSubscriptions"],
    [SetupMutates, "onSetup", "resolvers"],
    [SetupEditsDocument, "onSetup", "typeDefs"],
  ] as const)("%o", async (cls, phase, field) => {
    const message = `Refusing ${cls.name} after ${phase}: ${AFTER_CONSTRUCTION(field)}`;
    const current = await start();
    await expect(
      current.manager.registerSubgraph(cls as unknown as SubgraphClass),
    ).rejects.toMatchObject({ name: "CodeFirstSubgraphError", message });
    await current.applyPackage("@acme/refused", [
      cls as unknown as SubgraphClass,
    ]);
    expect(loggedFailures(current)).toEqual([
      phase === "construction"
        ? {
            template:
              "Failed to create subgraph @subgraph from @package: @error",
            name: cls.name,
            origin: "@acme/refused",
            error: message,
          }
        : {
            template: "Failed to register subgraph @name from @package: @error",
            name: cls.subgraphName,
            origin: "@acme/refused",
            error: message,
          },
    ]);
    expect(current.manager.getSubgraphByName(cls.subgraphName)).toBe(undefined);
  });

  it("refuses an uninitialized field declaration under define semantics", async () => {
    const { cls: Declared, code } = await compiledClass(DECLARED_FIELD, true);
    expect(code).toContain("hasSubscriptions;");
    const current = await start();
    await expect(
      current.manager.registerSubgraph(Declared),
    ).rejects.toMatchObject({
      name: "CodeFirstSubgraphError",
      message: `Refusing Declared after construction: ${AFTER_CONSTRUCTION("hasSubscriptions")}`,
    });
  });

  it("serves the same declaration without define semantics, where it emits nothing", async () => {
    const { cls: Declared, code } = await compiledClass(DECLARED_FIELD, false);
    expect(code).not.toContain("hasSubscriptions");
    const current = await start();
    await current.manager.registerSubgraph(Declared, "graphql");
    await current.manager.updateRouter(true);
    expect(await current.post("/graphql/declared", PING)).toEqual({
      data: { ping: "declared" },
    });
  });

  it("gives each instance its own document, so an edited one leaves the next intact", async () => {
    const current = await start();
    await expect(
      current.manager.registerSubgraph(
        SetupEditsDocument as unknown as SubgraphClass,
      ),
    ).rejects.toMatchObject({ name: "CodeFirstSubgraphError" });
    const next = new SetupEditsDocument({} as SubgraphArgs);
    expect(print(next.typeDefs)).toBe("type Query {\n  ping: String\n}");
    expect(SetupEditsDocument[SUBGRAPH_PROTOCOL].validate(next)).toEqual({
      ok: true,
    });
    const schema = buildSubgraphSchema([
      { typeDefs: next.typeDefs, resolvers: next.resolvers as never },
    ]);
    expect(await graphql({ schema, source: PING })).toEqual({
      data: { ping: "pong" },
    });
  });
});

describe("restoring a package's code-first subgraph", () => {
  const built: CodeFirstChild[] = [];
  class TrackedChild extends CodeFirstChild {
    constructor(args: SubgraphArgs) {
      super(args);
      built.push(this);
    }
  }
  class SchemaFirstChild extends BaseSubgraph {
    override name = "child";
    override typeDefs = pingTypeDefs;
    override resolvers = { Query: { ping: () => "schema-first child" } };
  }

  /** `@acme/schema-first` holds the name; `@acme/code-first` waits for it. */
  async function waiting() {
    const current = await start();
    await current.manager.applyPackageSubgraphs(
      new Map([
        ["@acme/schema-first", [SchemaFirstChild]],
        ["@acme/code-first", [TrackedChild]],
      ]),
    );
    await current.manager.updateRouter(true);
    expect(await current.post("/graphql/child", PING)).toEqual({
      data: { ping: "schema-first child" },
    });
    return current;
  }

  it("serves the waiting instance once the name is free", async () => {
    const current = await waiting();
    await current.manager.unregisterPackage("@acme/schema-first");
    await current.manager.updateRouter(true);
    expect(await current.post("/graphql/child", PING)).toEqual({
      data: { ping: "child" },
    });
    expect(loggedFailures(current)).toEqual([]);
  });

  it("checks the waiting instance again before it serves", async () => {
    const current = await waiting();
    built.at(-1)!.typeDefs = parse(print(pingTypeDefs));
    await current.manager.unregisterPackage("@acme/schema-first");
    expect(loggedFailures(current)).toEqual([
      {
        template: "Failed to restore subgraph @name from @package: @error",
        name: "child",
        origin: "@acme/code-first",
        error: `Refusing TrackedChild after construction: ${AFTER_CONSTRUCTION("typeDefs")}`,
      },
    ]);
    expect(current.manager.getSubgraphByName("child")).toBe(undefined);
  });
});
