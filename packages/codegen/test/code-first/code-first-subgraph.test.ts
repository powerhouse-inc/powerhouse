import { REACTOR_API_PACKAGE } from "@powerhousedao/shared/clis";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { generateSubgraph } from "../../src/codegen/index.js";
import { subgraphDirStyle } from "../../src/utils/index.mjs";
import {
  createPackage,
  inProject,
  removePackage,
  typeCheck,
} from "./package.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) removePackage(dir);
});

describe("subgraphDirStyle", () => {
  const style = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "ph-subgraph-style-"));
    dirs.push(dir);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return subgraphDirStyle(join(dir, "subgraphs"), "x");
  };

  const RA = REACTOR_API_PACKAGE;
  const schemaFirstClass =
    'export class X extends BaseSubgraph {\n  name = "x";\n}\n';
  it.each<{ case: string; files: Record<string, string>; expected: string }>([
    {
      case: "a class extending a named import",
      files: {
        "subgraphs/x/index.ts": `import { Subgraph } from "${RA}";\nexport class X extends Subgraph {}\n`,
      },
      expected: "code-first",
    },
    {
      case: "a class extending an aliased import",
      files: {
        "subgraphs/x/index.ts": `import { type SchemaBuilder, Subgraph as Base } from "${RA}";\nexport class X extends Base {}\n`,
      },
      expected: "code-first",
    },
    {
      case: "a class extending a namespace import",
      files: {
        "subgraphs/x/index.ts": `import * as RA from "${RA}";\nexport class X extends RA.Subgraph {}\n`,
      },
      expected: "code-first",
    },
    {
      case: "an anonymous default class",
      files: {
        "subgraphs/x/index.ts": `import { Subgraph } from "${RA}";\nexport default class extends Subgraph {}\n`,
      },
      expected: "code-first",
    },
    {
      case: "a parenthesized base",
      files: {
        "subgraphs/x/index.ts": `import { Subgraph } from "${RA}";\nexport class X extends (Subgraph) {}\n`,
      },
      expected: "code-first",
    },
    {
      case: "a local abstract base",
      files: {
        "subgraphs/x/index.ts": `import { Subgraph } from "${RA}";\nabstract class Base extends Subgraph {}\nexport class X extends Base {}\n`,
      },
      expected: "code-first",
    },
    {
      case: "a shared base class inside subgraphs/",
      files: {
        "subgraphs/x/index.ts":
          'import { AppSubgraph } from "../shared/base.js";\nexport class X extends AppSubgraph {}\n',
        "subgraphs/shared/base.ts": `import { Subgraph } from "${RA}";\nexport abstract class AppSubgraph extends Subgraph {}\n`,
      },
      expected: "code-first",
    },
    {
      case: "a re-export of Subgraph inside subgraphs/",
      files: {
        "subgraphs/x/index.ts":
          'import { AppSubgraph } from "../shared/base.js";\nexport class X extends AppSubgraph {}\n',
        "subgraphs/shared/base.ts": `export { Subgraph as AppSubgraph } from "${RA}";`,
      },
      expected: "code-first",
    },
    {
      case: "a re-export chain through a barrel, export * and a default export",
      files: {
        "subgraphs/x/index.ts":
          'import * as Shared from "../shared/index.js";\nexport class X extends Shared.Renamed {}\n',
        "subgraphs/shared/index.ts": 'export * from "./bases.js";\n',
        "subgraphs/shared/bases.ts":
          'import Base from "./base.js";\nexport { Base as Renamed };\n',
        "subgraphs/shared/base.ts": `import * as RA from "${RA}";\nexport default class extends RA.Subgraph {}\n`,
      },
      expected: "code-first",
    },
    {
      case: "a class in another file of the directory, re-exported by name",
      files: {
        "subgraphs/x/index.ts": 'export { X } from "./x.js";\n',
        "subgraphs/x/x.ts": `import { Subgraph } from "${RA}";\nexport class X extends Subgraph {}\n`,
      },
      expected: "code-first",
    },
    {
      case: "a class in another file of the directory, re-exported with export *",
      files: {
        "subgraphs/x/index.ts": 'export * from "./x.js";\n',
        "subgraphs/x/x.ts": `import { Subgraph } from "${RA}";\nexport class X extends Subgraph {}\n`,
      },
      expected: "code-first",
    },
    {
      case: "a re-exported BaseSubgraph class",
      files: {
        "subgraphs/x/index.ts": 'export * from "./x.js";\n',
        "subgraphs/x/x.ts": `import { BaseSubgraph } from "${RA}";\n${schemaFirstClass}`,
      },
      expected: "schema-first",
    },
    {
      case: "a BaseSubgraph class",
      files: {
        "subgraphs/x/index.ts": `import { BaseSubgraph } from "${RA}";\n${schemaFirstClass}`,
      },
      expected: "schema-first",
    },
    {
      case: "an import of Subgraph no class extends",
      files: {
        "subgraphs/x/index.ts": `import { BaseSubgraph, Subgraph } from "${RA}";\nexport type S = Subgraph;\n${schemaFirstClass}`,
      },
      expected: "schema-first",
    },
    {
      case: "a type-only import",
      files: {
        "subgraphs/x/index.ts": `import type { Subgraph } from "${RA}";\nexport class X extends Subgraph {}\n`,
      },
      expected: "schema-first",
    },
    {
      case: "a type-only specifier",
      files: {
        "subgraphs/x/index.ts": `import { type Subgraph } from "${RA}";\nexport class X extends Subgraph {}\n`,
      },
      expected: "schema-first",
    },
    {
      case: "a base in the package outside subgraphs/",
      files: {
        "subgraphs/x/index.ts":
          'import { AppSubgraph } from "../../lib/base.js";\nexport class X extends AppSubgraph {}\n',
        "lib/base.ts": `export { Subgraph as AppSubgraph } from "${RA}";`,
      },
      expected: "code-first",
    },
    {
      case: "Subgraph from another package",
      files: {
        "subgraphs/x/index.ts":
          'import { Subgraph } from "@acme/subgraphs";\nexport class X extends Subgraph {}\n',
      },
      expected: "schema-first",
    },
    {
      case: "the import in a comment and a string",
      files: {
        "subgraphs/x/index.ts": `// import { Subgraph } from "${RA}";\nimport { BaseSubgraph } from "${RA}";\nexport const hint = 'import { Subgraph } from "${RA}"; class Y extends Subgraph {}';\n${schemaFirstClass}`,
      },
      expected: "schema-first",
    },
    {
      case: "an import cycle",
      files: {
        "subgraphs/x/index.ts":
          'import { B } from "../shared/b.js";\nexport class X extends B {}\n',
        "subgraphs/shared/a.ts":
          'import { B } from "./b.js";\nexport class A extends B {}\n',
        "subgraphs/shared/b.ts":
          'import { A } from "./a.js";\nexport class B extends A {}\n',
      },
      expected: "schema-first",
    },
  ])("$case: $expected", ({ files, expected }) => {
    expect(style(files)).toBe(expected);
  });
});

const reactorApiDir = fileURLToPath(
  new URL("../../../reactor-api/", import.meta.url),
);

describe("the code-first scaffold against reactor-api", () => {
  it("type-checks and emits declarations, as ph build does", async () => {
    const dir = await createPackage();
    dirs.push(dir);
    symlinkSync(
      reactorApiDir,
      join(dir, "node_modules", "@powerhousedao", "reactor-api"),
      "junction",
    );
    await inProject(dir, async (project) => {
      await generateSubgraph("Stock Ledger", project, { codeFirst: true });
      await generateSubgraph("orders", project, { codeFirst: true });
    });
    expect(typeCheck(dir, { declarations: true })).toBe("");
  }, 120_000);
});
