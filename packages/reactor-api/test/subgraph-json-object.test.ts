import type { SubgraphArgs } from "@powerhousedao/reactor-api";
import { ph, subgraphScalars } from "document-model";
import type * as GraphQL from "graphql";
import { print } from "graphql";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import type { SchemaBuilder } from "../src/graphql/subgraph-schema.js";
import {
  createSchema,
  getDocumentModelTypeDefs,
} from "../src/utils/create-schema.js";
import { messages } from "./utils/graphql-host.js";
import { servedSubgraph } from "./utils/served-subgraph.js";

const { graphql } = createRequire(import.meta.url)("graphql") as typeof GraphQL;

const Setting = ph.object("Setting", {
  fields: {
    key: ph.String({ required: true }),
    value: subgraphScalars.JSONObject({ required: true }),
  },
});

class SettingsSubgraph extends BaseSubgraph {
  static override readonly subgraphName = "settings";
  #stored: unknown = { theme: "dark" };

  static override getSchema(schema: SchemaBuilder<SettingsSubgraph>) {
    return [
      schema.query("setting", {
        args: { patch: subgraphScalars.JSONObject() },
        returns: ph.ref(Setting, { required: true }),
        resolve: ({ args, subgraph }) => ({
          key: "theme",
          value: args.patch ?? (subgraph.#stored as Record<string, unknown>),
        }),
      }),
    ];
  }

  store(value: unknown) {
    this.#stored = value;
  }
}

function host() {
  const instance = new SettingsSubgraph({} as SubgraphArgs);
  const served = servedSubgraph(instance);
  const schema = createSchema([], served.resolvers, served.typeDefs);
  const run = (source: string, variableValues?: Record<string, unknown>) =>
    graphql({ schema, source, variableValues });
  return { instance, served, run };
}

const byVariable = `query ($patch: JSONObject) { setting(patch: $patch) { key value } }`;

describe("a typed subgraph's JSONObject field on the host", () => {
  it("declares the scalar once, as the host's", () => {
    const { served } = host();
    const sdl = print(getDocumentModelTypeDefs([], served.typeDefs));
    expect(sdl.match(/^scalar JSONObject$/gm)).toEqual(["scalar JSONObject"]);
    expect(sdl).toContain(
      "type Query {\n  setting(patch: JSONObject): Setting!\n}",
    );
  });

  it("accepts an object by variable and by literal", async () => {
    const { run } = host();
    const patch = { mode: "light", sizes: [1, null], nested: { on: true } };

    expect(await run(byVariable, { patch })).toEqual({
      data: { setting: { key: "theme", value: patch } },
    });
    expect(
      await run(
        `{ setting(patch: { mode: "light", sizes: [1, null], nested: { on: true } }) { value } }`,
      ),
    ).toEqual({ data: { setting: { value: patch } } });
  });

  it("refuses a value that is not an object, by variable and by literal", async () => {
    const { run } = host();

    expect(messages(await run(byVariable, { patch: [1] }))).toEqual([
      'Variable "$patch" got invalid value [1]; Expected type "JSONObject". JSONObject cannot represent non-object value: 1',
    ]);
    expect(messages(await run(`{ setting(patch: 5) { value } }`))).toEqual([
      'Expected value of type "JSONObject", found 5; JSONObject cannot represent non-object value: 5',
    ]);
  });

  it("serves a stored object, and refuses to serve a stored list", async () => {
    const { instance, run } = host();

    expect(await run(`{ setting { value } }`)).toEqual({
      data: { setting: { value: { theme: "dark" } } },
    });
    instance.store(["dark"]);
    expect(messages(await run(`{ setting { value } }`))).toEqual([
      "JSONObject cannot represent non-object value: dark",
    ]);
  });
});
