/**
 * Two real copies of reactor-api in one process: the host runs from source
 * (copy A) and a package's classes extend a copy of the built package
 * loaded from another directory (copy B). Copy B describes and validates
 * its own classes through the protocol symbol; copy A never needs its
 * compile records.
 */
import { ph, SUBGRAPH_PROTOCOL } from "document-model";
import { parse } from "graphql";
import { cp, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SchemaBuilder } from "../src/graphql/code-first/schema-builder.js";
import { Subgraph } from "../src/graphql/code-first/subgraph.js";
import type { SubgraphArgs, SubgraphClass } from "../src/graphql/types.js";
import {
  type CodeFirstHost,
  startCodeFirstHost,
} from "./utils/code-first-host.js";

type CopyB = {
  Subgraph: typeof Subgraph;
};

let root = "";
let copyB: CopyB;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "reactor-api-copy-b-")));
  const own = resolve(import.meta.dirname, "..");
  const dir = join(root, "reactor-api");
  await cp(join(own, "dist"), join(dir, "dist"), { recursive: true });
  await cp(join(own, "package.json"), join(dir, "package.json"));
  await symlink(
    await realpath(join(own, "node_modules")),
    join(dir, "node_modules"),
    "junction",
  );
  copyB = (await import(
    /* @vite-ignore */ pathToFileURL(join(dir, "dist/index.mjs")).href
  )) as CopyB;
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

let host: CodeFirstHost | undefined;
afterEach(async () => {
  await host?.close();
  host = undefined;
});

function fromCopyB() {
  class FromCopyB extends copyB.Subgraph {
    static override readonly subgraphName = "from-copy-b";
    static override getSchema(schema: SchemaBuilder<FromCopyB>) {
      return [
        schema.query("copy", {
          type: ph.String({ required: true }),
          resolve: ({ subgraph }) => subgraph.label(),
        }),
      ];
    }
    label() {
      return `served by ${this.name}`;
    }
  }
  return FromCopyB;
}

describe("a code-first class from another copy of reactor-api", () => {
  it("is described, constructed and served by its own copy on this host", async () => {
    const FromCopyB = fromCopyB();
    host = await startCodeFirstHost();
    await host.manager.registerSubgraph(
      FromCopyB as unknown as SubgraphClass,
      "graphql",
    );
    await host.manager.updateRouter(true);
    expect(await host.post("/graphql/from-copy-b", "{ copy }")).toEqual({
      data: { copy: "served by from-copy-b" },
    });
  });

  it("is validated by its own copy, which this copy cannot do", async () => {
    const FromCopyB = fromCopyB();
    const instance = new FromCopyB({} as SubgraphArgs);
    expect(FromCopyB[SUBGRAPH_PROTOCOL].validate(instance)).toEqual({
      ok: true,
    });
    expect(Subgraph[SUBGRAPH_PROTOCOL].validate(instance)).toEqual({
      ok: false,
      message:
        "the instance was not constructed by this copy's Subgraph constructor",
    });

    instance.typeDefs = parse("type Query { other: String }");
    host = await startCodeFirstHost();
    await expect(
      host.manager.registerSubgraphInstance(instance, "graphql"),
    ).rejects.toMatchObject({
      name: "CodeFirstSubgraphError",
      message:
        "Refusing FromCopyB after construction: `typeDefs` differs from what the Subgraph constructor assigned from getSchema. A code-first subgraph declares its schema in getSchema only; remove the field initializer, field declaration or assignment that sets `typeDefs`.",
    });
  });
});
