import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { ph, SUBGRAPH_PROTOCOL } from "../../../src/definition/index.js";
import { readSubgraphDefinitions } from "../../../src/definition/tooling/subgraph/read.js";
import { codeFirst, Subgraph } from "./fixture.js";

const Item = ph.object("Item", { fields: { id: ph.OID({ required: true }) } });

const items = codeFirst("items", (schema) => [
  schema.query("items", {
    type: ph.list(ph.ref(Item, { required: true }), { required: true }),
    resolve: () => [],
  }),
]);

const codes = (diagnostics: readonly DefinitionDiagnostic[]) =>
  diagnostics.map(({ code, source }) => ({ code, source }));

describe("readSubgraphDefinitions", () => {
  it("reads one level of exported objects, sorts a module namespace, and lists a class once", () => {
    const other = codeFirst("other", (schema) => [
      schema.query("other", { type: ph.String(), resolve: () => null }),
    ]);
    const namespace = Object.create(null, {
      [Symbol.toStringTag]: { value: "Module" },
      Zed: { value: { OtherSubgraph: other }, enumerable: true },
      Alpha: { value: { ItemsSubgraph: items }, enumerable: true },
      Items: { value: items, enumerable: true },
    }) as object;
    const read = readSubgraphDefinitions(namespace, {
      specifier: "./subgraphs/custom.ts",
    });
    expect(read.diagnostics).toEqual([]);
    expect(
      read.subgraphs.map(({ name, source }) => ({ name, source })),
    ).toEqual([
      {
        name: "items",
        source: {
          specifier: "./subgraphs/custom.ts",
          exportPath: ["Alpha", "ItemsSubgraph"],
        },
      },
      {
        name: "other",
        source: {
          specifier: "./subgraphs/custom.ts",
          exportPath: ["Zed", "OtherSubgraph"],
        },
      },
    ]);
  });

  it("leaves out schema-first classes, plain values and functions without the protocol", () => {
    class SdlSubgraph {
      static subgraphName = "sdl";
      static getSchema() {
        return [];
      }
      constructor() {
        throw new Error("constructed");
      }
    }
    const read = readSubgraphDefinitions({
      SdlSubgraph,
      helper: () => 1,
      config: { url: "x", nested: { SdlSubgraph } },
      count: 3,
    });
    expect(read).toEqual({ subgraphs: [], diagnostics: [] });
  });

  it("skips a base that another export extends, and reports a lone base", () => {
    class AppBase extends Subgraph {}
    class Users extends AppBase {
      static override subgraphName = "users";
      static override getSchema(
        schema: Parameters<typeof Subgraph.getSchema>[0],
      ) {
        return [
          schema.query("users", { type: ph.String(), resolve: () => null }),
        ];
      }
    }
    const withSubclass = readSubgraphDefinitions({ AppBase, Users });
    expect(withSubclass.diagnostics).toEqual([]);
    expect(withSubclass.subgraphs.map(({ name }) => name)).toEqual(["users"]);

    const alone = readSubgraphDefinitions({ AppBase });
    expect(alone.subgraphs).toEqual([]);
    expect(alone.diagnostics).toMatchObject([
      {
        code: "PH-SG-NAME-MISSING",
        severity: "error",
        phase: "package",
        source: { specifier: "./subgraphs/index.ts", exportPath: ["AppBase"] },
        message:
          "AppBase has no static subgraphName, and no other export extends it.",
      },
    ]);
  });

  it("reports an unsupported protocol version by the version it read", () => {
    class Future {
      static [SUBGRAPH_PROTOCOL] = {
        version: 2,
        describe: () => ({ diagnostics: [] }),
        validate: () => ({ ok: true }),
      };
    }
    const read = readSubgraphDefinitions({ Future });
    expect(read.diagnostics).toMatchObject([
      {
        code: "PH-SG-PROTOCOL-UNSUPPORTED",
        severity: "error",
        received: "2",
        message:
          "Future carries subgraph protocol version 2, and this release reads version 1.",
      },
    ]);
  });

  it("reports a describe() that throws, returns no description, or a protocol that cannot be read", () => {
    const protocol = (describe: () => unknown) => ({
      version: 1,
      describe,
      validate: () => ({ ok: true }),
    });
    class Throws {
      static [SUBGRAPH_PROTOCOL] = protocol(() => {
        throw new Error("DATABASE_URL is not set");
      });
    }
    class Malformed {
      static [SUBGRAPH_PROTOCOL] = protocol(() => ({ name: 3 }));
    }
    class Unreadable {
      static get [SUBGRAPH_PROTOCOL](): never {
        throw new Error("getter failed");
      }
    }
    const read = readSubgraphDefinitions({ Throws, Malformed, Unreadable });
    expect(read.subgraphs).toEqual([]);
    expect(
      read.diagnostics.map(({ code, phase, message, received }) => ({
        code,
        phase,
        message,
        received,
      })),
    ).toEqual([
      {
        code: "PH-SG-DESCRIBE-FAILED",
        phase: "import",
        message:
          "Reading the subgraph protocol of Unreadable threw: getter failed",
        received: "a thrown error",
      },
      {
        code: "PH-SG-DESCRIBE-FAILED",
        phase: "import",
        message: "describe() of Throws threw: DATABASE_URL is not set",
        received: "a thrown error",
      },
      {
        code: "PH-SG-DESCRIBE-FAILED",
        phase: "import",
        message: "describe() of Malformed returned no subgraph description.",
        received: "object",
      },
    ]);
  });

  it("passes on a description's own diagnostics, located at the class", () => {
    const badName = codeFirst("Bad_Name", (schema) => [
      schema.query("x", { type: ph.String(), resolve: () => null }),
    ]);
    const read = readSubgraphDefinitions({ BadName: badName });
    expect(read.subgraphs).toEqual([]);
    expect(codes(read.diagnostics)).toEqual([
      {
        code: "PH-SG-NAME-INVALID",
        source: { specifier: "./subgraphs/index.ts", exportPath: ["BadName"] },
      },
    ]);
  });
});
