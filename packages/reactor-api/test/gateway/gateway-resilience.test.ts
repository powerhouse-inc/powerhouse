import type { ServiceDefinition } from "@apollo/gateway";
import { parse } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { filterComposableSubgraphs } from "../../src/graphql/gateway/adapter-gateway-apollo.js";

/**
 * Regression test for Sentry #917: one un-composable subgraph must not fail the
 * whole supergraph. filterComposableSubgraphs drops the bad ones and keeps the
 * rest, logging each exclusion.
 */
describe("filterComposableSubgraphs (Sentry #917)", () => {
  const goodSubgraph: ServiceDefinition = {
    name: "good",
    typeDefs: parse(`
      type Query {
        hello: String
      }
    `),
    url: "http://localhost/graphql/good",
  };

  // A duplicate type definition is exactly the #917 failure mode: buildSubgraphSchema throws.
  const badSubgraph: ServiceDefinition = {
    name: "bad",
    typeDefs: parse(`
      type Query {
        world: String
      }
      enum ContractType {
        FULL_TIME
      }
      enum ContractType {
        PART_TIME
      }
    `),
    url: "http://localhost/graphql/bad",
  };

  it("keeps composable subgraphs and excludes the un-composable one", () => {
    const result = filterComposableSubgraphs([goodSubgraph, badSubgraph]);
    expect(result.map((s) => s.name)).toEqual(["good"]);
  });

  it("logs an exclusion for each dropped subgraph", () => {
    const logger = { error: vi.fn() };
    filterComposableSubgraphs([goodSubgraph, badSubgraph], logger);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0]).toContain("bad");
  });

  it("returns an empty list when given an empty list", () => {
    expect(filterComposableSubgraphs([])).toEqual([]);
  });

  it("excludes every subgraph when all are un-composable", () => {
    const alsoBad: ServiceDefinition = {
      name: "also-bad",
      typeDefs: parse(`
        type Query { x: String }
        enum Dup { A }
        enum Dup { B }
      `),
      url: "http://localhost/graphql/also-bad",
    };
    expect(filterComposableSubgraphs([badSubgraph, alsoBad])).toEqual([]);
  });

  it("keeps all subgraphs when every one is composable", () => {
    const another: ServiceDefinition = {
      name: "another",
      typeDefs: parse(`type Query { ping: String }`),
      url: "http://localhost/graphql/another",
    };
    const result = filterComposableSubgraphs([goodSubgraph, another]);
    expect(result.map((s) => s.name)).toEqual(["good", "another"]);
  });
});
