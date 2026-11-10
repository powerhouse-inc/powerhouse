import { describe, expect, it } from "vitest";
import {
  readSubgraphProtocol,
  SUBGRAPH_PROTOCOL,
  type SubgraphProtocol,
} from "../../../src/definition/index.js";

const protocol: SubgraphProtocol = {
  version: 1,
  describe: () => ({ name: "invoices", diagnostics: [] }),
  validate: () => ({ ok: true }),
};

class BaseSubgraph {
  name = "example";
}

class SdlSubgraph extends BaseSubgraph {
  static subgraphName = "sdl";
  static getSchema() {
    return [];
  }
}

class Subgraph extends BaseSubgraph {
  static [SUBGRAPH_PROTOCOL] = protocol;
}

class InvoicesSubgraph extends Subgraph {}

class FutureSubgraph extends BaseSubgraph {
  static [SUBGRAPH_PROTOCOL] = { version: 2, describe() {}, validate() {} };
}

class BrokenSubgraph extends BaseSubgraph {
  static [SUBGRAPH_PROTOCOL] = { version: 1 };
}

class ScalarProtocolSubgraph extends BaseSubgraph {
  static [SUBGRAPH_PROTOCOL] = "v1";
}

describe("readSubgraphProtocol", () => {
  it("uses the registered symbol, so every package copy reads the same key", () => {
    expect(SUBGRAPH_PROTOCOL).toBe(Symbol.for("powerhouse.subgraph.protocol"));
  });

  it.each([
    ["a schema-first class", BaseSubgraph, { kind: "schema-first" }],
    [
      "a schema-first class with unrelated statics",
      SdlSubgraph,
      { kind: "schema-first" },
    ],
    ["a code-first base", Subgraph, { kind: "code-first", protocol }],
    [
      "a code-first class that inherits the protocol",
      InvoicesSubgraph,
      { kind: "code-first", protocol },
    ],
    ["another version", FutureSubgraph, { kind: "unsupported", version: 2 }],
    [
      "a malformed protocol",
      BrokenSubgraph,
      { kind: "unsupported", version: 1 },
    ],
    [
      "a protocol that is not an object",
      ScalarProtocolSubgraph,
      { kind: "unsupported", version: undefined },
    ],
    ["an instance", new InvoicesSubgraph(), { kind: "schema-first" }],
    [
      "a plain object",
      { [SUBGRAPH_PROTOCOL]: protocol },
      { kind: "schema-first" },
    ],
    ["null", null, { kind: "schema-first" }],
    ["a string", "InvoicesSubgraph", { kind: "schema-first" }],
  ])("reads %s", (_case, value, expected) => {
    expect(readSubgraphProtocol(value)).toStrictEqual(expected);
  });
});
