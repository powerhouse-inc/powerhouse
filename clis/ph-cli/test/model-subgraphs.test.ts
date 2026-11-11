import type {
  DefinitionCheckReport,
  DefinitionDiagnostic,
} from "@powerhousedao/shared/document-model";
import type { SubgraphInspectionReport } from "document-model/tooling";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runModelCheck } from "../src/services/model/check.js";
import { scanSubgraphs } from "../src/services/model/subgraph-gate.js";
import {
  check,
  createModelProject,
  expectNoAbsolutePath,
  inspect,
  type Project,
  type Shape,
} from "./model-project.js";
import {
  codeFirstSubgraph,
  DUPLICATE_ITEMS,
  gqlModule,
  installSubgraphDependencies,
  schemaFirstSubgraph,
  subgraphFiles,
} from "./subgraph-project.js";

const made: Project[] = [];
afterEach(() => {
  made.splice(0).forEach((project) => project.dispose());
});

function project(
  shape: Shape,
  files: Readonly<Record<string, string>> = {},
): string {
  const created = createModelProject(shape, files);
  made.push(created);
  installSubgraphDependencies(created.root);
  return created.root;
}

const parsed = (stdout: string) => JSON.parse(stdout) as DefinitionCheckReport;

async function release(root: string) {
  let stdout = "";
  const code = await runModelCheck(
    { json: true, release: true },
    {
      projectRoot: root,
      streams: { out: (text) => void (stdout += text), err: () => {} },
    },
  );
  return { code, report: parsed(stdout) };
}

const where = (diagnostic: DefinitionDiagnostic) => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  source: diagnostic.source,
  received: diagnostic.received,
});

const SHA256 = /^sha256:[0-9a-f]{64}$/;

/** Inventory entries with each well-formed digest replaced by `<digest>`. */
const masked = (definitions: DefinitionCheckReport["definitions"]) =>
  definitions.map((entry) =>
    entry.digest !== undefined && SHA256.test(entry.digest)
      ? { ...entry, digest: "<digest>" }
      : entry,
  );

const ITEMS = {
  kind: "subgraph",
  key: "items",
  digest: "<digest>",
  source: {
    specifier: "./subgraphs/index.ts",
    exportPath: ["ItemsSubgraph", "ItemsSubgraph"],
  },
};

const ITEMS_ONLY = subgraphFiles(
  { items: { "index.ts": codeFirstSubgraph() } },
  { ItemsSubgraph: "items" },
);

/** Written by a schema-first subgraph module that a tool imported. */
const IMPORTED_MARKER = "imported-a-schema-first-subgraph";

/**
 * Schema-first subgraphs that break, or leave a trace, when a tool imports
 * them, with SDL a text reader cannot always read and two subgraphs that
 * already conflict. One mentions `Subgraph` in a comment and a string, and
 * imports a helper from a module that also holds a code-first base. A tool
 * that imported them would change the report.
 */
const SCHEMA_FIRST_TRAPS = {
  ...subgraphFiles(
    {
      guarded: schemaFirstSubgraph(
        "GuardedSubgraph",
        "guarded",
        gqlModule(
          "type Account { id: ID! }\ntype Query { accounts: [Account!]! }",
        ),
        [
          'import { cents } from "../shared/money.js";',
          '// Migration: import { Subgraph } from "@powerhousedao/reactor-api";',
          "export const next = 'class Next extends Subgraph {}';",
          "export const rate = cents(1);",
          'if (!process.env.SCHEMA_FIRST_DATABASE_URL) throw new Error("SCHEMA_FIRST_DATABASE_URL is not set");',
          "",
        ].join("\n"),
      ),
      effects: schemaFirstSubgraph(
        "EffectsSubgraph",
        "guarded",
        `import { gql } from "graphql-tag";\nconst entity = "Account";\nexport const schema = gql\`type \${entity} { name: String }\ntype Query { accounts: [Account!]! }\`;\n`,
        `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(IMPORTED_MARKER)}, "");\n`,
      ),
      imported: schemaFirstSubgraph(
        "ImportedSubgraph",
        "imported",
        `export { schema } from "../shared/schema.js";\n`,
      ),
    },
    {
      GuardedSubgraph: "guarded",
      EffectsSubgraph: "effects",
      ImportedSubgraph: "imported",
    },
  ),
  "subgraphs/shared/money.ts": `import { Subgraph } from "@powerhousedao/reactor-api";\nexport const cents = (n: number) => n * 100;\nexport abstract class ShopBase extends Subgraph {}\n`,
};

describe(
  "ph model check on a project without a code-first subgraph",
  { timeout: 60_000 },
  () => {
    it("prints what it prints without the subgraphs, and imports none of them", async () => {
      const withoutSubgraphs = project("mixed");
      const withSchemaFirst = project("mixed", {
        ...SCHEMA_FIRST_TRAPS,
        "subgraphs/shared/schema.ts": gqlModule("type Account { id: ID! }"),
      });
      const withoutBarrel = project("mixed", {
        "subgraphs/draft/index.ts": codeFirstSubgraph(),
      });
      expect(scanSubgraphs(withSchemaFirst).hasCodeFirst).toBe(false);
      for (const root of [withSchemaFirst, withoutBarrel]) {
        for (const json of [true, false]) {
          const expected = await check(withoutSubgraphs, json);
          const actual = await check(root, json);
          expect(actual).toEqual({
            ...expected,
            stdout: expected.stdout.replaceAll(withoutSubgraphs, root),
          });
          const inspected = await inspect(root, json);
          expect(inspected).toEqual(await inspect(withoutSubgraphs, json));
          if (json)
            expect(JSON.parse(inspected.stdout)).not.toHaveProperty(
              "subgraphs",
            );
        }
        expect(await release(root)).toEqual(await release(withoutSubgraphs));
      }
      expect(existsSync(join(withSchemaFirst, IMPORTED_MARKER))).toBe(false);
    });
  },
);

describe(
  "ph model check on a project with a code-first subgraph",
  { timeout: 60_000 },
  () => {
    it("lists the subgraph in a subgraph-only project instead of skipping it", async () => {
      const root = project("empty", ITEMS_ONLY);
      const result = await check(root, true);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      const report = parsed(result.stdout);
      expect(report).toMatchObject({
        status: "ok",
        sourceSet: { origin: "discovery", sources: [] },
        diagnostics: [],
      });
      expect(masked(report.definitions)).toEqual([ITEMS]);
      expectNoAbsolutePath(result.stdout, root);

      const text = await check(root, false);
      expect(text.code).toBe(0);
      expect(text.stdout).toBe(
        [
          "ok: 1 definition (./document-models: 0 code-first entries, 0 stored models)",
          "  subgraph items ./subgraphs/index.ts#/ItemsSubgraph/ItemsSubgraph",
          "0 errors, 0 warnings",
          "",
        ].join("\n"),
      );
    });

    it("warns about a schema-first subgraph that conflicts with it, and about SDL it cannot read", async () => {
      const root = project("schema-first", {
        ...subgraphFiles(
          {
            items: { "index.ts": codeFirstSubgraph() },
            sdl: schemaFirstSubgraph(
              "SdlSubgraph",
              "sdl",
              gqlModule(
                "type Item { id: ID! }\ntype Query { items: [Item!]! }",
              ),
            ),
            dynamic: schemaFirstSubgraph(
              "DynamicSubgraph",
              "dynamic",
              `import { gql } from "graphql-tag";\nconst field = "dynamic";\nexport const schema = gql\`type Query { \${field}: String }\`;\n`,
            ),
          },
          {
            ItemsSubgraph: "items",
            SdlSubgraph: "sdl",
            DynamicSubgraph: "dynamic",
          },
        ),
      });
      const result = await check(root, true);
      expect(result.code).toBe(0);
      const report = parsed(result.stdout);
      expect(report.status).toBe("ok");
      expect(
        report.definitions.map(({ kind, key }) => `${kind} ${key}`),
      ).toEqual(["document-model example/wallet", "subgraph items"]);
      expect(report.diagnostics.map(where)).toEqual([
        {
          code: "PH-SG-SCHEMA-FIRST-UNCHECKED",
          severity: "warning",
          source: { specifier: "./subgraphs/dynamic/schema.ts" },
          received: "its gql template interpolates values",
        },
        {
          code: "PH-SG-SCHEMA-FIRST-CONFLICT",
          severity: "warning",
          source: {
            specifier: "./subgraphs/index.ts",
            exportPath: ["ItemsSubgraph", "ItemsSubgraph"],
          },
          received: "Query.items",
        },
        {
          code: "PH-SG-SCHEMA-FIRST-CONFLICT",
          severity: "warning",
          source: {
            specifier: "./subgraphs/index.ts",
            exportPath: ["ItemsSubgraph", "ItemsSubgraph"],
          },
          received: "Item",
        },
      ]);
    });

    describe("package scalars", () => {
      const accounts = (scalarImport: string) =>
        subgraphFiles(
          {
            accounts: {
              "index.ts": codeFirstSubgraph({
                className: "AccountsSubgraph",
                name: "accounts",
                field: "accounts",
                type: "Account",
                typeFields: "iban: ph.scalar(Iban)",
                preamble: scalarImport,
              }),
            },
          },
          { AccountsSubgraph: "accounts" },
        );

      it("accepts a scalar scalars/index.ts exports", async () => {
        const result = await check(
          project(
            "code-first",
            accounts(`import { Iban } from "../../scalars/index.js";\n`),
          ),
          true,
        );
        expect(result.code).toBe(0);
        expect(parsed(result.stdout).diagnostics).toEqual([]);
      });

      it("reports a scalar scalars/index.ts does not export", async () => {
        const root = project("code-first", {
          ...accounts(`import { Iban } from "./iban.js";\n`),
          "subgraphs/accounts/iban.ts": `import { defineScalar } from "document-model/scalars";\nimport { z } from "zod";\nexport const Iban = defineScalar({ name: "AccountIban", schema: z.string() });\n`,
        });
        const result = await check(root, true);
        expect(result.code).toBe(1);
        expect(parsed(result.stdout).diagnostics.map(where)).toEqual([
          {
            code: "PH-SG-SCALAR-UNREGISTERED",
            severity: "error",
            source: {
              specifier: "./subgraphs/index.ts",
              exportPath: ["AccountsSubgraph", "AccountsSubgraph"],
            },
            received: "AccountIban",
          },
        ]);
      });
    });

    it("reports a code-first subgraph the host refuses or leaves out: a built-in or model subgraph's name, or a name another subgraph owns", async () => {
      const root = project(
        "code-first",
        subgraphFiles(
          {
            system: {
              "index.ts": codeFirstSubgraph({
                className: "SystemSubgraph",
                name: "system",
                field: "ping",
                type: "Ping",
              }),
            },
            ops: {
              "index.ts": codeFirstSubgraph({
                className: "OpsSubgraph",
                name: "ops",
                field: "ops",
                type: "Operation",
              }),
            },
            ledger: {
              "index.ts": codeFirstSubgraph({
                className: "LedgerSubgraph",
                name: "ledger",
                field: "books",
                type: "Book",
              }),
            },
            probe: {
              "index.ts": codeFirstSubgraph({
                className: "ProbeSubgraph",
                name: "probe",
                field: "probe",
                type: "LedgerQueries",
              }),
            },
          },
          {
            SystemSubgraph: "system",
            OpsSubgraph: "ops",
            LedgerSubgraph: "ledger",
            ProbeSubgraph: "probe",
          },
        ),
      );
      const result = await check(root, true);
      expect(result.code).toBe(1);
      expect(
        parsed(result.stdout).diagnostics.map(({ code, received }) => ({
          code,
          received,
        })),
      ).toEqual([
        { code: "PH-SG-NAME-RESERVED", received: "ledger" },
        { code: "PH-SG-HOST-TYPE-CONFLICT", received: "Operation" },
        { code: "PH-SG-HOST-TYPE-CONFLICT", received: "LedgerQueries" },
        { code: "PH-SG-NAME-RESERVED", received: "system" },
      ]);
    });

    it("fails, without a machine path, when subgraphs/index.ts cannot be imported", async () => {
      const root = project("empty", {
        ...ITEMS_ONLY,
        "subgraphs/index.ts": `${ITEMS_ONLY["subgraphs/index.ts"]}throw new Error("boom in ${"${import.meta.url}"}");\n`,
      });
      const result = await check(root, true);
      expect(result.code).toBe(2);
      const report = parsed(result.stdout);
      expect(report.status).toBe("failed");
      expect(
        report.diagnostics.map(({ code, source }) => ({ code, source })),
      ).toEqual([
        {
          code: "PH-IMPORT-FAILED",
          source: { specifier: "./subgraphs/index.ts" },
        },
      ]);
      expectNoAbsolutePath(result.stdout, root);
    });
  },
);

describe(
  "ph model check --release with a code-first subgraph",
  { timeout: 60_000 },
  () => {
    it("adds the subgraph checks and entries to the one release report", async () => {
      const { code, report } = await release(project("code-first", ITEMS_ONLY));
      expect(code).toBe(0);
      expect(report).toMatchObject({ profile: "release", status: "ok" });
      expect(
        report.definitions.map(({ kind, key }) => `${kind} ${key}`),
      ).toEqual(["document-model example/ledger", "subgraph items"]);
      expect(masked(report.definitions)[1]).toEqual(ITEMS);

      const invalid = await release(project("code-first", DUPLICATE_ITEMS));
      expect(invalid.code).toBe(1);
      expect(invalid.report).toMatchObject({
        profile: "release",
        status: "invalid",
      });
      expect(invalid.report.diagnostics.map(({ code }) => code)).toEqual([
        "PH-SG-DUPLICATE-NAME",
      ]);
    }, 60_000);
  },
);

describe(
  "ph model inspect with a code-first subgraph",
  { timeout: 60_000 },
  () => {
    it("adds a subgraphs section and JSON key", async () => {
      const root = project(
        "code-first",
        subgraphFiles(
          {
            items: { "index.ts": codeFirstSubgraph() },
            sdl: schemaFirstSubgraph(
              "SdlSubgraph",
              "sdl",
              gqlModule("type Query { sdl: String }"),
            ),
          },
          { ItemsSubgraph: "items", SdlSubgraph: "sdl" },
        ),
      );
      const result = await inspect(root, true);
      expect(result.code).toBe(0);
      const report = JSON.parse(result.stdout) as SubgraphInspectionReport;
      const { digest } = parsed((await check(root, true)).stdout)
        .definitions[1];
      expect(digest).toMatch(SHA256);
      expect(report.status).toBe("ok");
      expect(report.families.map(({ documentType }) => documentType)).toEqual([
        "example/ledger",
      ]);
      expect(report.subgraphs).toEqual([
        {
          style: "code-first",
          name: "items",
          source: ITEMS.source,
          digest,
          hasSubscriptions: false,
          entries: ["Query.items"],
          types: ["Item"],
          scalars: [{ name: "OID", implementation: "powerhouse.catalog#OID" }],
        },
        {
          style: "schema-first",
          name: "sdl",
          source: { specifier: "./subgraphs/sdl/schema.ts" },
        },
      ]);

      const text = await inspect(root, false);
      expect(text.stdout).toContain(
        [
          "subgraphs: 2",
          "  items code-first ./subgraphs/index.ts#/ItemsSubgraph/ItemsSubgraph",
          `    digest ${digest}`,
          "    entries Query.items",
          "    types Item",
          "  sdl schema-first ./subgraphs/sdl/schema.ts",
          "0 errors, 0 warnings",
        ].join("\n"),
      );
    });

    it("leaves the section out when a model is selected", async () => {
      const result = await inspect(
        project("code-first", ITEMS_ONLY),
        true,
        "example/ledger@1",
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).not.toHaveProperty("subgraphs");
    });
  },
);
