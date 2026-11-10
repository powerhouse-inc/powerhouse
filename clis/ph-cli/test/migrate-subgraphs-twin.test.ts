import {
  buildClientSchema,
  getIntrospectionQuery,
  type IntrospectionQuery,
  lexicographicSortSchema,
  printSchema,
} from "graphql";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { startCodeFirstHost } from "../../../packages/reactor-api/test/utils/code-first-host.js";
import { migrateSubgraphs } from "../src/services/migrate-subgraphs.js";
import { TWIN_FILES, writeProject } from "./migrate-subgraphs-project.js";

const OPERATIONS: readonly [string, Record<string, unknown>?, string?][] = [
  [
    "{ items { __typename ... on Book { id title status label } ... on Film { id title minutes } } }",
  ],
  [
    'query ($filter: ItemFilter) { items(filter: $filter) { __typename ... on Book { id label(prefix: "!") } } }',
    { filter: { status: "LIVE" } },
  ],
  ['{ node(id: "f1") { __typename id ... on Film { minutes } } }'],
  ['{ node(id: "b3") { id ... on Book { title } } }'],
  ['{ node(id: "a1") { __typename id ... on Author { name } } }'],
  ['{ __type(name: "Node") { possibleTypes { name } } }'],
  ["{ viewer { address key } }", undefined, "0xabc"],
  ["{ greeting }"],
  ["{ toString }"],
  ["{ motto }"],
  ["{ slogan }"],
  ['mutation { rename(id: "b1", title: "Dune II") { id title status } }'],
  ["{ items(filter: { status: LIVE, limit: 1 }) { __typename } }"],
];

const SUBSCRIPTION = "subscription { renamed { id title } }";
const RENAME = 'mutation { rename(id: "b2", title: "Emma II") { id } }';

async function serve(root: string) {
  const module = (await import(
    pathToFileURL(join(root, "subgraphs/catalog/index.ts")).href
  )) as { CatalogSubgraph: never };
  const host = await startCodeFirstHost();
  try {
    await host.applyPackage("@acme/catalog", [module.CatalogSubgraph]);
    const introspection = await host.post(
      "/graphql/catalog",
      getIntrospectionQuery(),
    );
    const results = [];
    for (const [query, variables, caller] of OPERATIONS) {
      results.push(
        await host.post("/graphql/catalog", query, variables, caller),
      );
    }
    // The subscription is live only once the server has subscribed, so the
    // mutation repeats, with the same effect, until the first event arrives.
    let event: unknown[] | undefined;
    const events = host.overWebSocket(SUBSCRIPTION, 1).then((received) => {
      event = received;
    });
    while (event === undefined) {
      await host.post("/graphql/catalog", RENAME);
      await Promise.race([
        events,
        new Promise((resolve) => setTimeout(resolve, 50)),
      ]);
    }
    return {
      schema: printSchema(
        lexicographicSortSchema(
          buildClientSchema(introspection.data as IntrospectionQuery),
        ),
      ),
      results,
      event,
    };
  } finally {
    await host.close();
  }
}

describe("a schema-first subgraph and its code-first conversion", () => {
  const schemaFirst = writeProject(TWIN_FILES);
  const codeFirst = writeProject(TWIN_FILES);
  afterAll(() => {
    for (const root of [schemaFirst, codeFirst]) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("serve the same schema and give the same results", async () => {
    let output = "";
    expect(
      await migrateSubgraphs({
        projectDir: codeFirst,
        dirs: ["catalog"],
        dryRun: false,
        out: (text) => void (output += text),
      }),
    ).toBe(0);
    expect(output).toContain("converted CatalogSubgraph to code-first");
    expect(
      readFileSync(join(codeFirst, "subgraphs/catalog/index.ts"), "utf8"),
    ).toContain("export class CatalogSubgraph extends Subgraph {");

    const before = await serve(schemaFirst);
    const after = await serve(codeFirst);

    expect(after.schema).toBe(before.schema);
    expect(after.results).toEqual(before.results);
    expect(after.event).toEqual(before.event);

    expect(before.schema).toContain('label(prefix: String = "#"): String!');
    expect(before.results).toEqual<unknown[]>([
      {
        data: {
          items: [
            {
              __typename: "Book",
              id: "b1",
              title: "Dune",
              status: "DRAFT",
              label: "#b1 catalog",
            },
            {
              __typename: "Book",
              id: "b3",
              title: "Ulysses",
              status: "DRAFT",
              label: "#b3 catalog",
            },
            { __typename: "Film", id: "f1", title: "Alien", minutes: 117 },
          ],
        },
      },
      {
        data: {
          items: [
            { __typename: "Book", id: "b2", label: "!b2 catalog" },
            { __typename: "Film" },
          ],
        },
      },
      { data: { node: { __typename: "Film", id: "f1", minutes: 117 } } },
      { data: { node: { id: "b3", title: "Ulysses" } } },
      { data: { node: { __typename: "Author", id: "a1", name: "Le Guin" } } },
      {
        data: {
          __type: {
            possibleTypes: [
              { name: "Book" },
              { name: "Film" },
              { name: "Author" },
            ],
          },
        },
      },
      { data: { viewer: { address: "0xabc", key: "" } } },
      { data: { greeting: null } },
      { data: { toString: null } },
      { data: { motto: "Read more." } },
      { data: { slogan: "Read on." } },
      { data: { rename: { id: "b1", title: "Dune II", status: "DRAFT" } } },
      { data: { items: [{ __typename: "Book" }, { __typename: "Film" }] } },
    ]);
    expect(before.event).toEqual([
      { data: { renamed: { id: "b2", title: "Emma II" } } },
    ]);
  }, 120_000);
});
