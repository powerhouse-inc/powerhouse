import { print } from "graphql";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runInThisContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { ph } from "../../src/definition/field.js";
import { sha256 } from "../../src/definition/primitives.js";
import { subgraphScalars } from "../../src/definition/scalars/catalog.js";
import {
  checkSubgraphName,
  compileSubgraph,
} from "../../src/definition/subgraph/definer.js";
import { checkDefinitions } from "../../src/definition/tooling/check-definitions.js";
import { DefinitionSourceLoader } from "../../src/definition/tooling/definition-source-loader.js";
import type { TypeScriptSourceImportInterface } from "../../src/definition/tooling/definition-source-types.js";
import {
  readSubgraphEntries,
  subgraphEntrySpecifiers,
} from "../../src/definition/tooling/subgraph-reader.js";
import { materializeFixturePackage } from "./loader-contract.js";

const PROTOCOL = Symbol.for("powerhouse.subgraph");

const touched: string[] = [];

class BaseSubgraph {
  static getSchema(_schema: never): unknown {
    return [];
  }

  static [PROTOCOL](this: typeof BaseSubgraph) {
    return {
      version: 1,
      describe: (options?: { readonly checkDeterminism?: boolean }) => {
        checkSubgraphName(this);
        const compiled = compileSubgraph(this, {
          checkDeterminism: options?.checkDeterminism ?? false,
        });
        return Object.freeze({
          subgraphName: compiled.name,
          definition: compiled.definition,
          typeDefs: compiled.typeDefs,
          hasSubscriptions: compiled.hasSubscriptions,
          diagnostics: compiled.diagnostics,
          scalarDefinitions: [],
        });
      },
      bind: () => {
        throw new Error("tooling never binds");
      },
    };
  }

  constructor() {
    touched.push(`new ${new.target.name}`);
  }
}

type Builder = {
  query(name: string, spec: object): unknown;
};

function stringQuery(schema: Builder, name: string) {
  return schema.query(name, {
    returns: ph.String({ required: true }),
    resolve: () => {
      touched.push(`resolve ${name}`);
      return name;
    },
  });
}

class InvoicesSubgraph extends BaseSubgraph {
  static readonly subgraphName = "invoices";
  static override getSchema(schema: never) {
    return [stringQuery(schema as Builder, "invoices")];
  }
}

abstract class SharedBase extends BaseSubgraph {
  static override getSchema(schema: never) {
    return [stringQuery(schema as Builder, "health")];
  }
}

class ReportsSubgraph extends SharedBase {
  static readonly subgraphName: string = "reports";
  static override getSchema(schema: never) {
    return [
      ...super.getSchema(schema),
      stringQuery(schema as Builder, "report"),
    ];
  }
}

const SRC_ONLY = "./subgraphs/index.ts" as const;

describe("readSubgraphEntries", () => {
  afterEach(() => {
    touched.length = 0;
  });

  it("reads each class once through describe() without constructing it or resolving", () => {
    const read = readSubgraphEntries([
      {
        specifier: SRC_ONLY,
        namespace: {
          InvoicesSubgraph: { InvoicesSubgraph },
          ReportsSubgraph: { ReportsSubgraph, SharedBase },
        },
      },
      {
        specifier: "./subgraphs/invoices/index.ts",
        namespace: { InvoicesSubgraph },
      },
    ]);

    expect(read.diagnostics).toEqual([]);
    expect(read.sharedBases).toEqual([
      {
        value: SharedBase,
        source: {
          specifier: SRC_ONLY,
          exportPath: ["ReportsSubgraph", "SharedBase"],
        },
        path: ["ReportsSubgraph", "SharedBase"],
      },
    ]);
    expect(
      read.subgraphs.map(({ source, description }) => ({
        source,
        name: description.subgraphName,
        kind: description.definition.schemaKind,
      })),
    ).toEqual([
      {
        source: {
          specifier: SRC_ONLY,
          exportPath: ["InvoicesSubgraph", "InvoicesSubgraph"],
        },
        name: "invoices",
        kind: "typed",
      },
      {
        source: {
          specifier: SRC_ONLY,
          exportPath: ["ReportsSubgraph", "ReportsSubgraph"],
        },
        name: "reports",
        kind: "typed",
      },
    ]);
    expect(touched).toEqual([]);
  });

  it("refuses a nameless class that no exported subgraph extends, with the migration message", () => {
    class Forgotten extends BaseSubgraph {
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "forgotten")];
      }
    }

    const read = readSubgraphEntries([
      { specifier: SRC_ONLY, namespace: { Forgotten, InvoicesSubgraph } },
    ]);

    expect(read.subgraphs.map(({ value }) => value)).toEqual([
      InvoicesSubgraph,
    ]);
    expect(read.diagnostics).toEqual([
      expect.objectContaining({
        code: "PH-SG-DEFINITION-INVALID",
        severity: "error",
        source: { specifier: SRC_ONLY, exportPath: ["Forgotten"] },
        message:
          "Forgotten has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
      }),
    ]);
    expect(touched).toEqual([]);
  });

  it("refuses an old-style class built on a BaseSubgraph without the protocol", () => {
    class OlderBase {}
    Object.defineProperty(OlderBase, "name", { value: "BaseSubgraph" });
    class LegacySubgraph extends OlderBase {
      name = "legacy";
      typeDefs = "type Query { legacy: String }";
    }

    const read = readSubgraphEntries([
      { specifier: SRC_ONLY, namespace: { LegacySubgraph } },
    ]);

    expect(read.subgraphs).toEqual([]);
    expect(
      read.diagnostics.map(({ code, message }) => [code, message]),
    ).toEqual([
      [
        "PH-SG-DEFINITION-INVALID",
        "LegacySubgraph has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
      ],
    ]);
  });

  it("reads classes named BaseSubgraph and skips only the framework base", () => {
    const Framework = BaseSubgraph;
    class OlderBase {}
    Object.defineProperty(OlderBase, "name", { value: "BaseSubgraph" });
    const NamedModern = (() => {
      class BaseSubgraph extends Framework {
        static readonly subgraphName = "named-base";
        static override getSchema(schema: never) {
          return [stringQuery(schema as Builder, "named")];
        }
      }
      return BaseSubgraph;
    })();
    const NamedLegacy = (() => {
      class BaseSubgraph extends OlderBase {
        name = "named-legacy";
      }
      return BaseSubgraph;
    })();

    const read = readSubgraphEntries([
      {
        specifier: SRC_ONLY,
        namespace: { Framework, NamedModern, NamedLegacy },
      },
    ]);

    expect(
      read.subgraphs.map(({ value, description }) => [
        value,
        description.subgraphName,
      ]),
    ).toEqual([[NamedModern, "named-base"]]);
    expect(
      read.diagnostics.map(({ code, source, message }) => [
        code,
        source?.exportPath,
        message,
      ]),
    ).toEqual([
      [
        "PH-SG-DEFINITION-INVALID",
        ["NamedLegacy"],
        "BaseSubgraph has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
      ],
    ]);
  });

  it("names both versions for a protocol it does not speak", () => {
    class FutureSubgraph {
      static readonly subgraphName = "future";
      static [PROTOCOL]() {
        return { version: 2, describe: () => ({}) };
      }
    }

    const read = readSubgraphEntries([
      { specifier: SRC_ONLY, namespace: { FutureSubgraph } },
    ]);

    expect(read.diagnostics.map(({ message }) => message)).toEqual([
      "FutureSubgraph speaks subgraph protocol version 2, and this release of ph speaks version 1.",
    ]);
  });

  it("asks describe() to refuse a getSchema whose schema changes", () => {
    let calls = 0;
    class DriftSubgraph extends BaseSubgraph {
      static readonly subgraphName = "drift";
      static override getSchema(schema: never) {
        calls += 1;
        return [stringQuery(schema as Builder, `field${calls}`)];
      }
    }

    const read = readSubgraphEntries([
      { specifier: SRC_ONLY, namespace: { DriftSubgraph } },
    ]);

    expect(read.subgraphs).toEqual([]);
    expect(
      read.diagnostics.map(({ code, message }) => [code, message]),
    ).toEqual([
      [
        "PH-SG-DEFINITION-INVALID",
        "DriftSubgraph.getSchema is not deterministic: two calls returned different schemas.",
      ],
    ]);
  });

  it("keeps reading after one class fails, and sources the compiler's diagnostics", () => {
    class Empty extends BaseSubgraph {
      static readonly subgraphName = "empty";
    }
    class Shouting extends BaseSubgraph {
      static readonly subgraphName = "Shouting";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "shout")];
      }
    }

    const read = readSubgraphEntries([
      {
        specifier: SRC_ONLY,
        namespace: { Empty, InvoicesSubgraph, Shouting },
      },
    ]);

    expect(read.subgraphs.map(({ value }) => value)).toEqual([
      InvoicesSubgraph,
    ]);
    expect(
      read.diagnostics.map(({ code, source, message }) => ({
        code,
        source,
        message,
      })),
    ).toEqual([
      {
        code: "PH-SG-DEFINITION-INVALID",
        source: { specifier: SRC_ONLY, exportPath: ["Empty"] },
        message: "Empty.getSchema returned no entries.",
      },
      {
        code: "PH-SG-DEFINITION-INVALID",
        source: { specifier: SRC_ONLY, exportPath: ["Shouting"] },
        message:
          "Shouting.subgraphName is not lowercase kebab-case. The name is the subgraph's route segment and is never normalized.",
      },
    ]);
  });

  it("refuses two classes that claim one subgraphName", () => {
    class Copy extends BaseSubgraph {
      static readonly subgraphName = "invoices";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "copy")];
      }
    }

    const read = readSubgraphEntries([
      { specifier: SRC_ONLY, namespace: { Copy, InvoicesSubgraph } },
    ]);

    expect(read.subgraphs.map(({ value }) => value)).toEqual([Copy]);
    expect(
      read.diagnostics.map(({ code, message }) => [code, message]),
    ).toEqual([
      [
        "PH-PKG-LOGICAL-COLLISION",
        "InvoicesSubgraph and Copy both declare subgraph invoices, so a host serving this package would keep only one of them.",
      ],
    ]);
  });

  it("carries the dropped-parent-fields warning describe() reports", () => {
    class Narrowed extends ReportsSubgraph {
      static override readonly subgraphName = "narrowed";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "narrow")];
      }
    }

    const read = readSubgraphEntries([
      { specifier: SRC_ONLY, namespace: { Narrowed } },
    ]);

    expect(read.subgraphs).toHaveLength(1);
    expect(
      read.diagnostics.map(({ code, severity, source, message, repair }) => ({
        code,
        severity,
        source,
        message,
        repair,
      })),
    ).toEqual([
      {
        code: "PH-SG-PARENT-FIELDS-DROPPED",
        severity: "warning",
        source: { specifier: SRC_ONLY, exportPath: ["Narrowed"] },
        message:
          "Narrowed.getSchema drops Query.health, Query.report, which ReportsSubgraph.getSchema declares.",
        repair:
          "Spread super.getSchema(schema) into the result, or call schema.replaceParentSchema() if Narrowed replaces them on purpose.",
      },
    ]);
  });
});

describe("readSubgraphEntries containers", () => {
  class DeepSubgraph extends BaseSubgraph {
    static readonly subgraphName = "deep";
    static override getSchema(schema: never) {
      return [stringQuery(schema as Builder, "ping")];
    }
  }

  const exportPaths = (read: ReturnType<typeof readSubgraphEntries>) =>
    read.subgraphs.map(({ source, description }) => [
      description.subgraphName,
      source.exportPath,
    ]);

  it("reads a class at any depth of objects and arrays, where it is first reached", () => {
    const cyclic: Record<string, unknown> = { InvoicesSubgraph };
    cyclic.self = cyclic;

    const read = readSubgraphEntries([
      {
        specifier: SRC_ONLY,
        namespace: {
          nested: { child: { DeepSubgraph } },
          listed: [[ReportsSubgraph], { again: DeepSubgraph }],
          cyclic,
        },
      },
    ]);

    expect(read.diagnostics).toEqual([]);
    expect(exportPaths(read)).toEqual([
      ["deep", ["nested", "child", "DeepSubgraph"]],
      ["reports", ["listed", "0", "0"]],
      ["invoices", ["cyclic", "InvoicesSubgraph"]],
    ]);
  });

  it("orders a module namespace by export name and a plain object by its own order", () => {
    const namespace = Object.create(null, {
      [Symbol.toStringTag]: { value: "Module" },
      Zeta: { value: InvoicesSubgraph, enumerable: true },
      Alpha: { value: { ReportsSubgraph, DeepSubgraph }, enumerable: true },
    }) as Record<string, unknown>;

    const read = readSubgraphEntries([
      {
        specifier: SRC_ONLY,
        namespace: { Zeta: DeepSubgraph, Alpha: namespace },
      },
    ]);

    expect(exportPaths(read)).toEqual([
      ["deep", ["Zeta"]],
      ["reports", ["Alpha", "Alpha", "ReportsSubgraph"]],
      ["invoices", ["Alpha", "Zeta"]],
    ]);
  });

  it("refuses a nested old-style class", () => {
    class OlderBase {}
    Object.defineProperty(OlderBase, "name", { value: "BaseSubgraph" });
    class LegacySubgraph extends OlderBase {
      name = "legacy";
    }

    const read = readSubgraphEntries([
      {
        specifier: SRC_ONLY,
        namespace: { outer: { inner: [LegacySubgraph] }, InvoicesSubgraph },
      },
    ]);

    expect(read.subgraphs.map(({ value }) => value)).toEqual([
      InvoicesSubgraph,
    ]);
    expect(
      read.diagnostics.map(({ code, source }) => [code, source?.exportPath]),
    ).toEqual([["PH-SG-DEFINITION-INVALID", ["outer", "inner", "0"]]]);
  });

  it("reads the classes an exported class instance holds, and not those of an instance below an export", () => {
    class OlderBase {}
    Object.defineProperty(OlderBase, "name", { value: "BaseSubgraph" });
    class LegacySubgraph extends OlderBase {
      name = "legacy";
    }
    class Registry {
      InvoicesSubgraph = InvoicesSubgraph;
      LegacySubgraph = LegacySubgraph;
    }

    const read = readSubgraphEntries([
      {
        specifier: SRC_ONLY,
        namespace: {
          registry: new Registry(),
          nested: { registry: new Registry() },
        },
      },
    ]);

    expect(read.subgraphs.map(({ value }) => value)).toEqual([
      InvoicesSubgraph,
    ]);
    expect(exportPaths(read)).toEqual([
      ["invoices", ["registry", "InvoicesSubgraph"]],
    ]);
    expect(
      read.diagnostics.map(({ code, source, message }) => [
        code,
        source?.exportPath,
        message,
      ]),
    ).toEqual([
      [
        "PH-SG-DEFINITION-INVALID",
        ["registry", "LegacySubgraph"],
        "LegacySubgraph has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
      ],
    ]);
  });
});

describe("readSubgraphEntries old-style fields beside a static subgraphName", () => {
  const refusal = (read: ReturnType<typeof readSubgraphEntries>) =>
    read.diagnostics.map(({ code, source, message, repair }) => ({
      code,
      exportPath: source?.exportPath,
      message,
      repair,
    }));

  const repair = (pronoun: string) =>
    `Remove ${pronoun} and declare the schema in static getSchema. Run ph migrate to convert an old-style subgraph.`;

  afterEach(() => {
    touched.length = 0;
  });

  it("refuses a class field, without constructing the class", () => {
    class MixedSubgraph extends BaseSubgraph {
      name = "old";
      static readonly subgraphName = "mixed";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "ping")];
      }
    }

    const read = readSubgraphEntries([
      { specifier: SRC_ONLY, namespace: { MixedSubgraph } },
    ]);

    expect(read.subgraphs).toEqual([]);
    expect(refusal(read)).toEqual([
      {
        code: "PH-SG-DEFINITION-INVALID",
        exportPath: ["MixedSubgraph"],
        message:
          'MixedSubgraph declares static subgraphName "mixed" and the old-style field name, which the host refuses.',
        repair: repair("it"),
      },
    ]);
    expect(touched).toEqual([]);
  });

  it("refuses accessors, constructor assignments and fields of a shared base", () => {
    abstract class LegacyBase extends BaseSubgraph {
      path = "/old";
    }
    class AssignedSubgraph extends LegacyBase {
      static readonly subgraphName = "assigned";
      constructor() {
        super();
        Object.assign(this, { unrelated: true });
        (this as { resolvers?: unknown }).resolvers = {};
      }
      get typeDefs() {
        return "type Query { old: String }";
      }
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "assigned")];
      }
    }

    const read = readSubgraphEntries([
      { specifier: SRC_ONLY, namespace: { AssignedSubgraph } },
    ]);

    expect(refusal(read)).toEqual([
      {
        code: "PH-SG-DEFINITION-INVALID",
        exportPath: ["AssignedSubgraph"],
        message:
          'AssignedSubgraph declares static subgraphName "assigned" and the old-style fields typeDefs, resolvers, path, which the host refuses.',
        repair: repair("them"),
      },
    ]);
    expect(touched).toEqual([]);
  });

  it("refuses a field of a shared base named BaseSubgraph", () => {
    const Framework = BaseSubgraph;
    const SharedBase = (() => {
      abstract class BaseSubgraph extends Framework {
        path = "/old";
      }
      return BaseSubgraph;
    })();
    class Concrete extends SharedBase {
      static readonly subgraphName = "concrete";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "concrete")];
      }
    }

    const read = readSubgraphEntries([
      { specifier: SRC_ONLY, namespace: { Concrete } },
    ]);

    expect(read.subgraphs).toEqual([]);
    expect(refusal(read)).toEqual([
      {
        code: "PH-SG-DEFINITION-INVALID",
        exportPath: ["Concrete"],
        message:
          'Concrete declares static subgraphName "concrete" and the old-style field path, which the host refuses.',
        repair: repair("it"),
      },
    ]);
  });

  it("reads a class whose statics, strings and other members only mention the names", () => {
    class LookalikeSubgraph extends BaseSubgraph {
      static readonly subgraphName = "lookalike";
      static path = "/static";
      pathPrefix = "name = 1; this.typeDefs = {}";
      label = `${"resolvers"} = {}`;
      matcher = /name = }/;
      named(other: { name?: string }) {
        other.name = "x";
        return this.pathPrefix === "path";
      }
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "lookalike")];
      }
    }

    const read = readSubgraphEntries([
      { specifier: SRC_ONLY, namespace: { LookalikeSubgraph } },
    ]);

    expect(read.diagnostics).toEqual([]);
    expect(read.subgraphs.map(({ value }) => value)).toEqual([
      LookalikeSubgraph,
    ]);
  });

  type Loose = {
    name?: unknown;
    typeDefs?: unknown;
    resolvers?: unknown;
    hasSubscriptions?: unknown;
    path?: unknown;
  };

  it("refuses each way an instance write reaches an old-style field", () => {
    const typeDefs = "type Query { old: String }";
    class Bracket extends BaseSubgraph {
      static readonly subgraphName = "bracket";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "bracket")];
      }
      constructor() {
        super();
        (this as Loose)["path"] = "/old";
      }
    }
    class Assigned extends BaseSubgraph {
      static readonly subgraphName = "assigned";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "assigned")];
      }
      constructor() {
        super();
        Object.assign(
          this,
          { path: "/old" },
          { typeDefs },
          {
            ...{ resolvers: {} },
          },
        );
      }
    }
    class Defined extends BaseSubgraph {
      static readonly subgraphName = "defined";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "defined")];
      }
      constructor() {
        super();
        Object.defineProperty(this, "hasSubscriptions", { value: true });
        Object.defineProperties(this, { name: { value: "old" } });
      }
    }
    class Compound extends BaseSubgraph {
      static readonly subgraphName = "compound";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "compound")];
      }
      constructor() {
        super();
        (this as Loose).name ??= "old";
        ({ path: (this as Loose).path } = { path: "/old" });
      }
    }
    class InSetup extends BaseSubgraph {
      static readonly subgraphName = "in-setup";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "ping")];
      }
      reset = () => {
        (this as Loose).resolvers = {};
      };
      onSetup() {
        Object.assign(this, { typeDefs });
      }
    }
    // Run as written: a compiler would add the semicolons.
    const noSemicolons = runInThisContext(
      [
        "(BaseSubgraph, getSchema) => class NoSemicolons extends BaseSubgraph {",
        '  static subgraphName = "no-semicolons"',
        "  static getSchema = getSchema",
        '  message = "hello"',
        '  path = "/old"',
        "}",
      ].join("\n"),
    ) as (base: typeof BaseSubgraph, getSchema: unknown) => typeof BaseSubgraph;
    const NoSemicolons = noSemicolons(BaseSubgraph, (schema: never) => [
      stringQuery(schema as Builder, "ping"),
    ]);

    const read = readSubgraphEntries([
      {
        specifier: SRC_ONLY,
        namespace: {
          Bracket,
          Assigned,
          Defined,
          Compound,
          InSetup,
          NoSemicolons,
        },
      },
    ]);

    expect(read.subgraphs).toEqual([]);
    expect(read.diagnostics.map(({ message }) => message)).toEqual([
      'Bracket declares static subgraphName "bracket" and the old-style field path, which the host refuses.',
      'Assigned declares static subgraphName "assigned" and the old-style fields typeDefs, resolvers, path, which the host refuses.',
      'Defined declares static subgraphName "defined" and the old-style fields name, hasSubscriptions, which the host refuses.',
      'Compound declares static subgraphName "compound" and the old-style fields name, path, which the host refuses.',
      'InSetup declares static subgraphName "in-setup" and the old-style fields typeDefs, resolvers, which the host refuses.',
      'NoSemicolons declares static subgraphName "no-semicolons" and the old-style field path, which the host refuses.',
    ]);
    expect(touched).toEqual([]);
  });

  it("reads a class whose writes to the names have another receiver", () => {
    class HelperObject extends BaseSubgraph {
      static readonly subgraphName = "helper-object";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "ping")];
      }
      cursor() {
        return {
          path: "",
          go(path: string) {
            this.path = path;
          },
        };
      }
    }
    class StaticWrites extends BaseSubgraph {
      static readonly subgraphName = "static-writes";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "ping")];
      }
      static path = "";
      static resolvers: unknown;
      static {
        this.path = "/static";
      }
      static reset() {
        this.resolvers = {};
      }
    }
    class NestedScopes extends BaseSubgraph {
      static readonly subgraphName = "nested-scopes";
      static override getSchema(schema: never) {
        return [stringQuery(schema as Builder, "ping")];
      }
      build() {
        function Row(this: Loose) {
          this.name = "row";
        }
        const Cell = class {
          constructor() {
            (this as Loose).typeDefs = {};
          }
        };
        const other: Loose = {};
        Object.assign(other, { path: "/other" });
        return [Row, Cell, other];
      }
    }

    const read = readSubgraphEntries([
      {
        specifier: SRC_ONLY,
        namespace: { HelperObject, StaticWrites, NestedScopes },
      },
    ]);

    expect(read.diagnostics).toEqual([]);
    expect(
      read.subgraphs.map(({ description }) => description.subgraphName),
    ).toEqual(["helper-object", "static-writes", "nested-scopes"]);
  });
});

describe("subgraph discovery", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function packageWith(
    config: object,
    files: readonly string[],
  ): { root: string; configFile: string } {
    const root = mkdtempSync(join(tmpdir(), "ph-subgraph-reader-"));
    roots.push(root);
    const configFile = join(root, "powerhouse.config.json");
    writeFileSync(configFile, JSON.stringify(config));
    for (const file of files) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), "export {};\n");
    }
    return { root, configFile };
  }

  function stubImporter(
    modules: Partial<Record<string, Readonly<Record<string, unknown>>>>,
  ): TypeScriptSourceImportInterface {
    return {
      importModule: ({ specifier }) => {
        const namespace = modules[specifier];
        return namespace === undefined
          ? Promise.reject(new Error(`no module ${specifier}`))
          : Promise.resolve(namespace);
      },
    };
  }

  const revision = sha256("subgraph-reader");

  it("lists the barrel, then each subgraph directory's index", () => {
    const { root } = packageWith({}, [
      "subgraphs/index.ts",
      "subgraphs/reports/index.ts",
      "subgraphs/invoices/index.ts",
      "subgraphs/invoices/schema.ts",
      "subgraphs/notes/resolvers.ts",
    ]);

    expect(subgraphEntrySpecifiers(root)).toEqual([
      "./subgraphs/index.ts",
      "./subgraphs/invoices/index.ts",
      "./subgraphs/reports/index.ts",
    ]);
  });

  it("reports an accepted shared base once per package across repeated reads", async () => {
    const { root, configFile } = packageWith({}, ["subgraphs/index.ts"]);
    const accepted: string[] = [];
    const loader = new DefinitionSourceLoader(
      stubImporter({ "./subgraphs/index.ts": { ReportsSubgraph, SharedBase } }),
      { onSharedBase: ({ value }) => accepted.push(value.name) },
    );
    try {
      const loaded = await loader.normalizeDefinitionSources({
        configFile,
        packageRevision: revision,
      });
      const read = await loader.readSubgraphs({
        packageRoot: root,
        packageRevision: revision,
      });

      expect(
        loaded.subgraphs.map(({ description }) => description.subgraphName),
      ).toEqual(["reports"]);
      expect(read.sharedBases.map(({ value }) => value.name)).toEqual([
        "SharedBase",
      ]);
      expect(accepted).toEqual(["SharedBase"]);
    } finally {
      await loader.dispose();
    }
  });

  it("checks subgraphs of a package without definitionSources", async () => {
    const { configFile } = packageWith({}, ["subgraphs/index.ts"]);
    const importer = stubImporter({
      "./subgraphs/index.ts": { InvoicesSubgraph },
    });
    const loader = new DefinitionSourceLoader(importer);

    const report = await checkDefinitions({
      profile: "edit",
      loader,
      packageRevision: revision,
      configFile,
      hostValidation: ({ subgraphs }) => ({
        completed: subgraphs.length === 1,
        diagnostics: [],
      }),
    });

    expect({
      status: report.status,
      mode: report.sourceSet.mode,
      definitions: report.definitions.map(({ kind, key, source }) => ({
        kind,
        key,
        source,
      })),
      diagnostics: report.diagnostics,
    }).toEqual({
      status: "ok",
      mode: "schema-first",
      definitions: [
        {
          kind: "subgraph",
          key: "invoices",
          source: {
            specifier: "./subgraphs/index.ts",
            exportPath: ["InvoicesSubgraph"],
          },
        },
      ],
      diagnostics: [],
    });
    expect(touched).toEqual([]);
  });

  it("checks a subgraph whose fields use subgraphScalars.JSONObject", async () => {
    class SettingsSubgraph extends BaseSubgraph {
      static readonly subgraphName = "settings";
      static override getSchema(schema: never) {
        return [
          (schema as Builder).query("settings", {
            args: { patch: subgraphScalars.JSONObject() },
            returns: subgraphScalars.JSONObject({ required: true }),
            resolve: () => ({}),
          }),
        ];
      }
    }
    const { root, configFile } = packageWith({}, ["subgraphs/index.ts"]);
    const loader = new DefinitionSourceLoader(
      stubImporter({ "./subgraphs/index.ts": { SettingsSubgraph } }),
    );
    try {
      const read = await loader.readSubgraphs({
        packageRoot: root,
        packageRevision: revision,
      });
      const report = await checkDefinitions({
        profile: "edit",
        loader,
        packageRevision: revision,
        configFile,
        hostValidation: () => ({ completed: true, diagnostics: [] }),
      });

      expect(read.diagnostics).toEqual([]);
      expect(
        read.subgraphs.map(({ description }) => ({
          typeDefs: print(description.typeDefs as never),
          definition: description.definition,
        })),
      ).toMatchObject([
        {
          typeDefs:
            "scalar JSONObject\n\ntype Query {\n  settings(patch: JSONObject): JSONObject!\n}",
          definition: {
            schemaKind: "typed",
            scalars: [
              {
                name: "JSONObject",
                implementation: "powerhouse.catalog#JSONObject",
                graphQLProfile: "legacy-graphql-default-v1",
              },
            ],
          },
        },
      ]);
      expect({
        status: report.status,
        definitions: report.definitions.map(({ kind, key }) => [kind, key]),
        diagnostics: report.diagnostics,
      }).toEqual({
        status: "ok",
        definitions: [["subgraph", "settings"]],
        diagnostics: [],
      });
    } finally {
      await loader.dispose();
    }
  });

  it("checks subgraphs of a package with no config file when the caller allows it", async () => {
    const { configFile } = packageWith({}, ["subgraphs/index.ts"]);
    rmSync(configFile);
    const loader = new DefinitionSourceLoader(
      stubImporter({ "./subgraphs/index.ts": { InvoicesSubgraph } }),
    );

    const report = await checkDefinitions({
      profile: "edit",
      loader,
      packageRevision: revision,
      configFile,
      allowMissingConfig: true,
      hostValidation: () => ({ completed: true, diagnostics: [] }),
    });

    expect({
      status: report.status,
      definitions: report.definitions.map(({ kind, key }) => [kind, key]),
    }).toEqual({ status: "ok", definitions: [["subgraph", "invoices"]] });
  });

  it("fails the check on an old-style subgraph of a package without definitionSources", async () => {
    class OlderBase {}
    Object.defineProperty(OlderBase, "name", { value: "BaseSubgraph" });
    class LegacySubgraph extends OlderBase {}
    const { configFile } = packageWith({}, ["subgraphs/index.ts"]);
    const loader = new DefinitionSourceLoader(
      stubImporter({ "./subgraphs/index.ts": { LegacySubgraph } }),
    );

    const report = await checkDefinitions({
      profile: "edit",
      loader,
      packageRevision: revision,
      configFile,
    });

    expect(report.status).toBe("invalid");
    expect(
      report.diagnostics.map(({ code, message }) => [code, message]),
    ).toEqual([
      [
        "PH-SG-DEFINITION-INVALID",
        "LegacySubgraph has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
      ],
    ]);
  });

  it("warns about and ignores a subgraph that definitionSources lists", async () => {
    const { configFile } = packageWith(
      {
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [{ specifier: "./subgraphs/invoices/index.ts" }],
        },
      },
      ["subgraphs/invoices/index.ts"],
    );
    const loader = new DefinitionSourceLoader(
      stubImporter({ "./subgraphs/invoices/index.ts": { InvoicesSubgraph } }),
    );

    const loaded = await loader.normalizeDefinitionSources({
      configFile,
      packageRevision: revision,
    });

    expect(loaded.subgraphs.map(({ source }) => source)).toEqual([
      {
        specifier: "./subgraphs/invoices/index.ts",
        exportPath: ["InvoicesSubgraph"],
      },
    ]);
    expect(
      loaded.diagnostics.map(({ code, severity, source }) => ({
        code,
        severity,
        source,
      })),
    ).toEqual([
      {
        code: "PH-CONFIG-SOURCE-SUBGRAPH-IGNORED",
        severity: "warning",
        source: {
          specifier: "./subgraphs/invoices/index.ts",
          exportPath: ["InvoicesSubgraph"],
        },
      },
    ]);
  });

  describe("next to the control document models", () => {
    async function loadControlWith(subgraphs: Record<string, unknown>) {
      const fixture = materializeFixturePackage("control");
      mkdirSync(join(fixture.root, "subgraphs"));
      writeFileSync(join(fixture.root, "subgraphs/index.ts"), "export {};\n");
      const loader = new DefinitionSourceLoader({
        importModule: async ({ packageRoot, specifier }) =>
          specifier === "./subgraphs/index.ts"
            ? subgraphs
            : ((await import(
                pathToFileURL(join(packageRoot, specifier)).href
              )) as Record<string, unknown>),
      });
      try {
        const loaded = await loader.normalizeDefinitionSources({
          configFile: join(fixture.root, "powerhouse.config.json"),
          packageRevision: revision,
        });
        return {
          status: loaded.status,
          diagnostics: loaded.diagnostics.map(({ code, severity }) => [
            code,
            severity,
          ]),
          documentModels: loaded.documentModels.length,
          subgraphs: loaded.subgraphs.map(
            ({ description }) => description.subgraphName,
          ),
        };
      } finally {
        await loader.dispose();
        fixture.dispose();
      }
    }

    it("stays ready and returns the warning when a subgraph only warns", async () => {
      class Narrowed extends ReportsSubgraph {
        static override readonly subgraphName = "narrowed";
        static override getSchema(schema: never) {
          return [stringQuery(schema as Builder, "narrow")];
        }
      }

      expect(await loadControlWith({ Narrowed })).toEqual({
        status: "ready",
        diagnostics: [["PH-SG-PARENT-FIELDS-DROPPED", "warning"]],
        documentModels: 2,
        subgraphs: ["narrowed"],
      });
    });

    it("fails when a subgraph has an error", async () => {
      class OlderBase {}
      Object.defineProperty(OlderBase, "name", { value: "BaseSubgraph" });
      class LegacySubgraph extends OlderBase {}

      expect(await loadControlWith({ LegacySubgraph })).toEqual({
        status: "failed",
        diagnostics: [["PH-SG-DEFINITION-INVALID", "error"]],
        documentModels: 2,
        subgraphs: [],
      });
    });
  });

  it("reports an entry that fails to import and still reads the others", async () => {
    const { root } = packageWith({}, [
      "subgraphs/broken/index.ts",
      "subgraphs/invoices/index.ts",
    ]);
    const loader = new DefinitionSourceLoader(
      stubImporter({ "./subgraphs/invoices/index.ts": { InvoicesSubgraph } }),
    );

    const read = await loader.readSubgraphs({
      packageRoot: root,
      packageRevision: revision,
    });

    expect(read.subgraphs.map(({ value }) => value)).toEqual([
      InvoicesSubgraph,
    ]);
    expect(
      read.diagnostics.map(({ code, source, received }) => ({
        code,
        source,
        received,
      })),
    ).toEqual([
      {
        code: "PH-IMPORT-FAILED",
        source: { specifier: "./subgraphs/broken/index.ts" },
        received: "Error: no module ./subgraphs/broken/index.ts",
      },
    ]);
  });
});
