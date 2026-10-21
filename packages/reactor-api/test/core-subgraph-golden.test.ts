import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import {
  normalizeTypedGolden,
  typedConversions,
} from "./golden/typed-conversions.js";
import { coreGoldenNames, createGoldenHost } from "./golden/capture.js";

it("preserves core subgraph authoring, transport mounts, federation and HTTP schemas", async () => {
  const host = await createGoldenHost();
  try {
    await host.capture(
      fileURLToPath(new URL("./__golden__/", import.meta.url)),
      coreGoldenNames,
      process.env.GOLDEN_RAW_DIRECTORY,
    );
  } finally {
    await host.close();
  }
});

it("normalizes only the converted authored and federation snapshots", () => {
  expect([...typedConversions].sort()).toEqual([
    "auth",
    "inspection",
    "packages",
    "system",
  ]);
  const baseline = "type Query { b: String a: String }";
  const reordered = "type Query { a: String b: String }";
  for (const name of typedConversions) {
    for (const kind of ["authored", "federation"]) {
      const file = `${name}.${kind}.graphql`;
      expect(normalizeTypedGolden(file, baseline)).toBe(
        normalizeTypedGolden(file, reordered),
      );
      expect(
        normalizeTypedGolden(file, "type Query { b: String a: String! }"),
      ).not.toBe(normalizeTypedGolden(file, baseline));
    }
  }
  for (const file of [
    "r.authored.graphql",
    "system.http.graphql",
    "supergraph.graphql",
    "supergraph.http.graphql",
  ]) {
    expect(normalizeTypedGolden(file, baseline)).toBe(baseline);
    expect(normalizeTypedGolden(file, reordered)).toBe(reordered);
  }
});

it("declares the host's catalog scalars on both authored sides, and no other type", () => {
  const hostDeclared = "type Query { meta: JSONObject }";
  const typed = "scalar JSONObject\n\ntype Query { meta: JSONObject }";
  const file = "inspection.authored.graphql";
  expect(normalizeTypedGolden(file, hostDeclared)).toBe(
    "scalar JSONObject\n\ntype Query {\n  meta: JSONObject\n}",
  );
  expect(normalizeTypedGolden(file, typed)).toBe(
    normalizeTypedGolden(file, hostDeclared),
  );
  expect(() =>
    normalizeTypedGolden(file, "type Query { meta: HostOnly }"),
  ).toThrow('Unknown type "HostOnly".');
  expect(normalizeTypedGolden("r.authored.graphql", hostDeclared)).toBe(
    hostDeclared,
  );
});

it("retains federation directive values, descriptions, defaults and deprecations", () => {
  const baseline =
    'directive @key(fields: String!) repeatable on OBJECT type Item @key(fields: "id") { id: ID! } type Query { item(limit: Int = 1): Item @deprecated(reason: "old") }';
  for (const changed of [
    baseline.replace('fields: "id"', 'fields: "other"'),
    baseline.replace("Int = 1", "Int = 2"),
    baseline.replace('reason: "old"', 'reason: "new"'),
    baseline.replace("id: ID!", '"An identifier" id: ID!'),
  ]) {
    expect(normalizeTypedGolden("system.federation.graphql", changed)).not.toBe(
      normalizeTypedGolden("system.federation.graphql", baseline),
    );
  }
});
