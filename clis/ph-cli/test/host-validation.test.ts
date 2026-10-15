import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { HostValidationRequest } from "document-model/tooling";
import { afterEach, describe, expect, it } from "vitest";
import { defaultHostValidationFor } from "../src/services/definitions/host-validation.js";

type FakeHosts = Map<string, HostValidationRequest[]>;
const fakeHosts = (): FakeHosts =>
  ((globalThis as { fakeHosts?: FakeHosts }).fakeHosts ??= new Map());

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A project whose installed reactor-api records each request it validates,
 * under the URL of its entry, from the moment it is imported.
 */
function makeProject(subgraphs: Record<string, string>): {
  root: string;
  hostUrl: string;
} {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "ph-host-validation-"));
  temporary.push(root);
  const host = join(root, "node_modules", "@powerhousedao", "reactor-api");
  mkdirSync(host, { recursive: true });
  writeFileSync(
    join(host, "package.json"),
    JSON.stringify({ exports: { ".": { import: "./host.mjs" } } }),
  );
  writeFileSync(
    join(host, "host.mjs"),
    [
      "const requests = [];",
      "(globalThis.fakeHosts ??= new Map()).set(import.meta.url, requests);",
      "export function validateSubgraphsForHost(request) {",
      "  requests.push(request);",
      "  return { completed: true, diagnostics: [] };",
      "}",
    ].join("\n"),
  );
  const modelDir = join(root, "document-models", "subgraph-module");
  mkdirSync(modelDir, { recursive: true });
  copyFileSync(
    join(
      import.meta.dirname,
      "../../../packages/vetra/document-models/subgraph-module/subgraph-module.json",
    ),
    join(modelDir, "subgraph-module.json"),
  );
  for (const [dir, sdl] of Object.entries(subgraphs)) {
    mkdirSync(join(root, "subgraphs", dir), { recursive: true });
    writeFileSync(
      join(root, "subgraphs", dir, "schema.ts"),
      `import { gql } from "graphql-tag";\n\nexport const schema = gql\`\n${sdl}\n\`;\n`,
    );
  }
  return { root, hostUrl: pathToFileURL(join(host, "host.mjs")).href };
}

describe("the default host validation", { timeout: 60_000 }, () => {
  it("hands the host the project's schema-first subgraphs and models", async () => {
    const { root, hostUrl } = makeProject({
      ledger: "type Query { ledger: String }",
    });

    const result = await defaultHostValidationFor(root)({
      profile: "edit",
      documentModels: [],
      subgraphs: [],
    });

    expect(result).toEqual({ completed: true, diagnostics: [] });
    const [request] = fakeHosts().get(hostUrl) ?? [];
    expect(
      request.schemaFirst?.documentModels.map(({ id, name }) => [id, name]),
    ).toEqual([["powerhouse/subgraph", "Subgraph Module"]]);
    expect(
      request.schemaFirst?.subgraphs.map(
        ({ name, label, source, typeDefs }) => [
          name,
          label,
          source,
          typeDefs.definitions.flatMap((definition) =>
            "fields" in definition
              ? (definition.fields ?? []).map(
                  (field) => `${definition.name.value}.${field.name.value}`,
                )
              : [],
          ),
        ],
      ),
    ).toEqual([
      [
        "ledger",
        "ledger",
        { specifier: "./subgraphs/ledger/schema.ts" },
        ["Query.ledger"],
      ],
    ]);
  });

  describe("with a code-first subgraph kept in a subgraph directory", () => {
    function makeFooProject() {
      const project = makeProject({
        foo: "type Query { foo: String }",
        ledger: "type Query { ledger: String }",
      });
      writeFileSync(
        join(project.root, "subgraphs", "foo", "index.ts"),
        'import { defineSubgraph } from "@powerhousedao/reactor-api";\nimport { schema } from "./schema.js";\n\nexport const FooSubgraph = defineSubgraph({ name: "foo", schemaKind: "graphql-ast-compat", compatibility: { typeDefs: schema } });\n',
      );
      return project;
    }
    const schemaFirstOf = (hostUrl: string) =>
      fakeHosts()
        .get(hostUrl)
        ?.map(({ schemaFirst }) =>
          schemaFirst?.subgraphs.map(({ name, source }) => [name, source]),
        );

    it("leaves the directory out when the selection loaded it", async () => {
      const { root, hostUrl } = makeFooProject();

      await defaultHostValidationFor(root)({
        profile: "edit",
        documentModels: [],
        subgraphs: [
          {
            value: class Foo {},
            source: { specifier: "./subgraphs/foo/index.ts" },
            path: [],
          },
        ],
      });

      expect(schemaFirstOf(hostUrl)).toEqual([
        [["ledger", { specifier: "./subgraphs/ledger/schema.ts" }]],
      ]);
    });

    it("reads the directory when the selection did not load it", async () => {
      const { root, hostUrl } = makeFooProject();

      await defaultHostValidationFor(root)({
        profile: "edit",
        documentModels: [],
        subgraphs: [],
      });

      expect(schemaFirstOf(hostUrl)).toEqual([
        [
          ["foo", { specifier: "./subgraphs/foo/schema.ts" }],
          ["ledger", { specifier: "./subgraphs/ledger/schema.ts" }],
        ],
      ]);
    });
  });

  it("hands the host the readable models when another model file is malformed", async () => {
    const { root, hostUrl } = makeProject({});
    mkdirSync(join(root, "document-models", "broken"));
    writeFileSync(join(root, "document-models", "broken", "broken.json"), "{");
    const ledger = {
      value: class Ledger {},
      source: { specifier: "./subgraphs/ledger.ts" as const },
      path: [],
    };

    const result = await defaultHostValidationFor(root)({
      profile: "edit",
      documentModels: [],
      subgraphs: [ledger],
    });

    expect(result).toEqual({ completed: true, diagnostics: [] });
    const requests = fakeHosts().get(hostUrl) ?? [];
    expect(
      requests.map(({ subgraphs, schemaFirst }) => ({
        subgraphs,
        models: schemaFirst?.documentModels.map(({ id }) => id),
        schemaFirstSubgraphs: schemaFirst?.subgraphs,
      })),
    ).toEqual([
      {
        subgraphs: [ledger],
        models: ["powerhouse/subgraph"],
        schemaFirstSubgraphs: [],
      },
    ]);
  });

  it("passes without importing the host when neither style has a subgraph", async () => {
    const { root, hostUrl } = makeProject({});

    const result = await defaultHostValidationFor(root)({
      profile: "edit",
      documentModels: [],
      subgraphs: [],
    });

    expect(result).toEqual({ completed: true, diagnostics: [] });
    expect(fakeHosts().has(hostUrl)).toBe(false);
  });
});
