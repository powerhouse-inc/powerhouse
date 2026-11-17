import {
  buildClientSchema,
  getIntrospectionQuery,
  type IntrospectionQuery,
  lexicographicSortSchema,
  printSchema,
} from "graphql";
import { readFileSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { projectTypeErrors } from "@powerhousedao/codegen";
import { startCodeFirstHost } from "../../../packages/reactor-api/test/utils/code-first-host.js";
import type { SubgraphClass } from "../../../packages/reactor-api/src/graphql/types.js";
import { migrateSubgraphs } from "../src/services/migrate-subgraphs.js";
import {
  snapshot,
  TWIN_FILES,
  writeProject,
} from "./migrate-subgraphs-project.js";

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

function typedProject(files: Readonly<Record<string, string>>): string {
  const root = writeProject({
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["subgraphs/**/*.ts"],
    }),
    ...files,
  });
  symlinkSync(
    dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
    join(root, "node_modules/typescript"),
    "junction",
  );
  return root;
}

it.each([
  ...[
    {
      name: "typed prefix",
      header:
        "const config = { resolve(parent: number): number { void parent; return arguments.length; } };",
      resolvers: "{ Query: { value: config } }",
    },
    {
      name: "function",
      header:
        "let value = (): number => 0; value = function (): number { return arguments.length; };",
      resolvers: "{ Query: { value } }",
    },
    {
      name: "root",
      header:
        "const handlers = { value(): number { return 0; } }; handlers.value = function (): number { return arguments.length; };",
      resolvers: "{ Query: handlers }",
    },
    {
      name: "config",
      header:
        "const config = { resolve(): number { return 0; } }; config.resolve = function (): number { return arguments.length; };",
      resolvers: "{ Query: { value: config } }",
    },
  ].map((sample) => ({ ...sample, convertible: false, typeError: false })),
  {
    name: "stable const arrow aliases",
    header:
      "const count = (...values: unknown[]) => values.length; const read = count;",
    resolvers: "{ Query: { value: read } }",
    convertible: true,
    typeError: false,
  },
  {
    name: "stable const arrow with a short signature",
    header: "const read = () => 4;",
    resolvers: "{ Query: { value: read } }",
    convertible: true,
    typeError: true,
  },
  {
    name: "stable const arrow with a typed prefix",
    header:
      "const read = (parent: number, ...values: unknown[]) => { void parent; return values.length + 1; };",
    resolvers: "{ Query: { value: read } }",
    convertible: true,
    typeError: true,
  },
])(
  "preserves $name resolver behavior or refuses it unchanged",
  async ({ header, resolvers, convertible, typeError }) => {
    const files = {
      "subgraphs/count/index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";
${header}
export class CountSubgraph extends BaseSubgraph {
  name = "count";
  typeDefs = gql\`type Query { value: Int }\`;
  resolvers = ${resolvers};
}
`,
    };
    const original = typedProject(files);
    const converted = typedProject(files);
    const strict = typedProject(files);
    try {
      for (const root of [converted, strict]) {
        let output = "";
        const before = snapshot(root);
        expect(
          await migrateSubgraphs({
            projectDir: root,
            dirs: ["count"],
            dryRun: false,
            strictResolvers: root === strict,
            out: (text) => void (output += text),
          }),
        ).toBe(convertible ? 0 : 1);
        if (!convertible) {
          expect(output).toContain("not converted");
          expect(snapshot(root)).toEqual(before);
          continue;
        }
        if (typeError) expect(output).toContain("resolver call disagrees");
        expect(output).not.toContain("still rejected");
        const check = projectTypeErrors(
          root,
          ["subgraphs/count"],
          ["subgraphs/count/index.ts"],
        );
        if (check.kind !== "checked")
          throw new Error("tsc did not check the project");
        expect(check.errors.length).toBe(root === strict && typeError ? 1 : 0);
      }
      for (const root of [original, converted, strict]) {
        const module = (await import(
          pathToFileURL(join(root, "subgraphs/count/index.ts")).href
        )) as { CountSubgraph: SubgraphClass };
        const host = await startCodeFirstHost();
        try {
          await host.applyPackage("@acme/count", [module.CountSubgraph]);
          expect(await host.post("/graphql/count", "{ value }")).toEqual({
            data: { value: 4 },
          });
        } finally {
          await host.close();
        }
      }
    } finally {
      for (const root of [original, converted, strict])
        rmSync(root, { recursive: true, force: true });
    }
  },
  120_000,
);

it("keeps a named generator resolver's recursive binding through migration and serving", async () => {
  const files = {
    "subgraphs/countdown/index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";
export class CountdownSubgraph extends BaseSubgraph {
  name = "countdown";
  typeDefs = gql\`type Query { value(n: Int!): [Int!] }\`;
  resolvers = { Query: {
    value: function* recurse(_parent: unknown, { n }: { n: number }): Generator<number> {
      yield n;
      if (n > 0) yield* recurse(_parent, { n: n - 1 });
    },
  } };
}
`,
  };
  const original = typedProject(files);
  const converted = typedProject(files);
  try {
    let output = "";
    expect(
      await migrateSubgraphs({
        projectDir: converted,
        dirs: ["countdown"],
        dryRun: false,
        out: (text) => void (output += text),
      }),
    ).toBe(0);
    expect(output).toContain("converted CountdownSubgraph");
    for (const root of [original, converted]) {
      const module = (await import(
        pathToFileURL(join(root, "subgraphs/countdown/index.ts")).href
      )) as {
        CountdownSubgraph: SubgraphClass;
      };
      const host = await startCodeFirstHost();
      try {
        await host.applyPackage("@acme/countdown", [module.CountdownSubgraph]);
        expect(
          await host.post("/graphql/countdown", "{ value(n: 3) }"),
        ).toEqual({
          data: { value: [3, 2, 1, 0] },
        });
      } finally {
        await host.close();
      }
    }
  } finally {
    rmSync(original, { recursive: true, force: true });
    rmSync(converted, { recursive: true, force: true });
  }
}, 120_000);

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
