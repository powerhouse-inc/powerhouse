import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { dirname, join, relative } from "node:path";
import { subgraphIndexFileTemplate, subgraphSchemaTemplate } from "templates";
import { Node, Project } from "ts-morph";
import { afterEach, describe, expect, it } from "vitest";
import { buildTsMorphProject } from "../utils/ts-morph-project.js";
import {
  makeSubgraphsIndexFile,
  tsMorphGenerateSubgraph,
} from "./subgraphs.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(subgraphs: { dir: string; className: string }[]) {
  const root = mkdtempSync(join(tmpdir(), "ph-subgraphs-index-"));
  temporary.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "@acme/subgraphs", type: "module" }, null, 2),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }, null, 2),
  );
  for (const { dir, className } of subgraphs) {
    mkdirSync(join(root, "subgraphs", dir), { recursive: true });
    writeFileSync(
      join(root, "subgraphs", dir, "index.ts"),
      `class BaseSubgraph {}\nexport class ${className} extends BaseSubgraph { static readonly subgraphName = "${dir}"; }\n`,
    );
  }
  return root;
}

describe("makeSubgraphsIndexFile", () => {
  it.each([
    [
      "aliased",
      'class Original extends BaseSubgraph { static readonly subgraphName = "example"; }\nexport { Original as PublicSubgraph };',
      "PublicSubgraph",
      "Original",
    ],
    [
      "default",
      'export default class Original extends BaseSubgraph { static readonly subgraphName = "example"; }',
      "Original",
      "Original",
    ],
    [
      "anonymous default",
      'export default class extends BaseSubgraph { static readonly subgraphName = "example"; }',
      "DefaultSubgraph",
      "undefined",
    ],
  ])(
    "recovers an %s leaf using its actual module export",
    async (_, source, exportedName, declarationName) => {
      const root = makeProject([]);
      writeFiles(root, {
        "subgraphs/example/index.ts": `class BaseSubgraph {}\n${source}\n`,
      });
      const first = await regenerate(root);
      const tsc = compile(
        root,
        "--outDir",
        join(root, "out"),
        "--rootDir",
        root,
      );
      expect(tsc.status, tsc.stdout + tsc.stderr).toBe(0);
      const loaded = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          "const exports = await import(process.argv[1]); const klass = exports[process.argv[2]]; console.log(JSON.stringify({ exports: Object.keys(exports), name: klass.subgraphName, base: Object.getPrototypeOf(klass).name }));",
          pathToFileURL(join(root, "out/subgraphs/index.js")).href,
          exportedName,
        ],
        { encoding: "utf8" },
      );
      expect(loaded.status, loaded.stdout + loaded.stderr).toBe(0);
      expect(JSON.parse(loaded.stdout)).toStrictEqual({
        exports: [exportedName],
        name: "example",
        base: "BaseSubgraph",
      });
      expect(exportedClasses(root)).toStrictEqual([
        `${exportedName}=${declarationName}@subgraphs/example/index.ts`,
      ]);
      expect(await regenerate(root)).toBe(first);
    },
  );

  it("registers only the runtime class beside a type-only leaf export", async () => {
    const root = makeProject([
      { dir: "statements", className: "StatementsSubgraph" },
    ]);
    writeFiles(root, {
      "tsconfig.json": JSON.stringify({
        compilerOptions: { module: "nodenext", verbatimModuleSyntax: true },
      }),
      "subgraphs/billing/index.ts":
        'class BaseSubgraph {}\nclass Internal extends BaseSubgraph { static readonly subgraphName = "billing"; }\nexport type { Internal as BillingSubgraph };\nexport { type Internal as LedgerSubgraph };\n',
    });

    expect(await regenerate(root))
      .toBe(`import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { StatementsSubgraph } from "./statements/index.js";

export { StatementsSubgraph };
const checkStatementsSubgraph: SubgraphCheck<typeof StatementsSubgraph> = true;
void checkStatementsSubgraph;
`);
    const tsc = compile(root, "--noEmit");
    expect(tsc.status, tsc.stdout + tsc.stderr).toBe(0);
    expect(exportedClasses(root)).toStrictEqual([
      "StatementsSubgraph=StatementsSubgraph@subgraphs/statements/index.ts",
    ]);
  });

  it("exports every class with a type assertion", async () => {
    const root = makeProject([
      { dir: "statements", className: "StatementsSubgraph" },
      { dir: "transaction-ledger", className: "TransactionLedgerSubgraph" },
    ]);
    const project = buildTsMorphProject(root);

    await makeSubgraphsIndexFile({
      project,
      subgraphsDir: join(root, "subgraphs"),
    });
    await project.save();

    const index = readFileSync(join(root, "subgraphs", "index.ts"), "utf-8");
    expect(index).toContain(
      'import { StatementsSubgraph } from "./statements/index.js";',
    );
    expect(index).toContain(
      "const checkStatementsSubgraph: SubgraphCheck<typeof StatementsSubgraph> =",
    );
    expect(index).toContain("export { StatementsSubgraph };");
    expect(index).toContain(
      'import { TransactionLedgerSubgraph } from "./transaction-ledger/index.js";',
    );
  });

  it("is idempotent: a second run adds no duplicate export", async () => {
    const root = makeProject([
      { dir: "statements", className: "StatementsSubgraph" },
    ]);
    const project = buildTsMorphProject(root);
    const args = { project, subgraphsDir: join(root, "subgraphs") };

    await makeSubgraphsIndexFile(args);
    await makeSubgraphsIndexFile(args);
    await project.save();

    const index = readFileSync(join(root, "subgraphs", "index.ts"), "utf-8");
    expect(index).toContain("export { StatementsSubgraph };");
    expect(index.match(/const checkStatementsSubgraph:/g)).toHaveLength(1);
  });

  it("keeps an existing export while adding the missing one", async () => {
    const root = makeProject([
      { dir: "statements", className: "StatementsSubgraph" },
      { dir: "ledger", className: "LedgerSubgraph" },
    ]);
    writeFileSync(
      join(root, "subgraphs", "index.ts"),
      'import { LedgerSubgraph } from "./ledger/index.js";\n',
    );
    const project = buildTsMorphProject(root);

    await makeSubgraphsIndexFile({
      project,
      subgraphsDir: join(root, "subgraphs"),
    });
    await project.save();

    const index = readFileSync(join(root, "subgraphs", "index.ts"), "utf-8");
    expect(index).toContain(
      'import { LedgerSubgraph } from "./ledger/index.js";',
    );
    expect(index).toContain(
      'import { StatementsSubgraph } from "./statements/index.js";',
    );
    expect(index.match(/const checkLedgerSubgraph:/g)).toHaveLength(1);
  });

  it("drops the generated statements of a removed subgraph and checks every exported concrete class in a file", async () => {
    const root = makeProject([
      { dir: "statements", className: "StatementsSubgraph" },
    ]);
    writeFileSync(
      join(root, "subgraphs/statements/index.ts"),
      `
export abstract class SharedBase {}
export class StatementsSubgraph extends SharedBase { static readonly subgraphName = "statements"; }
export class ExtraSubgraph extends SharedBase { static readonly subgraphName = "extra"; }
`,
    );
    writeFileSync(
      join(root, "subgraphs/index.ts"),
      'import { Missing } from "./missing/index.js";\n\nexport { Missing };\nconst checkMissing: SubgraphCheck<typeof Missing> = true;\nvoid checkMissing;\n',
    );
    const project = buildTsMorphProject(root);
    await makeSubgraphsIndexFile({
      project,
      subgraphsDir: join(root, "subgraphs"),
    });
    await project.save();
    const barrel = readFileSync(join(root, "subgraphs/index.ts"), "utf8");
    expect(barrel).toContain("export { StatementsSubgraph };");
    expect(barrel).toContain("export { ExtraSubgraph };");
    expect(barrel).toContain(
      "const checkExtraSubgraph: SubgraphCheck<typeof ExtraSubgraph> = true;",
    );
    expect(barrel).not.toContain("Missing");
    expect(barrel).not.toContain("SharedBase");
  });

  it("exports a subgraph it just generated before reactor-api is installed", async () => {
    const root = makeProject([]);
    const project = buildTsMorphProject(root);

    await tsMorphGenerateSubgraph({ subgraphName: "greeter", project });
    await project.save();

    const index = readFileSync(join(root, "subgraphs", "index.ts"), "utf-8");
    expect(index).toContain(
      'import { GreeterSubgraph } from "./greeter/index.js";',
    );
  });
});

function writeFiles(root: string, files: Record<string, string>) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
}

const subgraphClass = (className: string, subgraphName: string) =>
  `class BaseSubgraph {}\nexport class ${className} extends BaseSubgraph { static readonly subgraphName = "${subgraphName}"; }\n`;

function compile(root: string, ...options: string[]) {
  writeFiles(root, {
    "node_modules/@powerhousedao/reactor-api/package.json":
      '{"name":"@powerhousedao/reactor-api","types":"index.d.ts"}',
    "node_modules/@powerhousedao/reactor-api/index.d.ts":
      "export type SubgraphCheck<T> = true;\n",
  });
  return spawnSync(
    process.execPath,
    [
      join(import.meta.dirname, "../../../../node_modules/typescript/bin/tsc"),
      "-p",
      join(root, "tsconfig.json"),
      "--skipLibCheck",
      "--types",
      "node",
      "--typeRoots",
      join(import.meta.dirname, "../../../../node_modules/@types"),
      ...options,
    ],
    { encoding: "utf8" },
  );
}

async function regenerate(root: string) {
  const project = buildTsMorphProject(root);
  await makeSubgraphsIndexFile({
    project,
    subgraphsDir: join(root, "subgraphs"),
  });
  await project.save();
  return readFileSync(join(root, "subgraphs/index.ts"), "utf8");
}

function exportedClasses(root: string) {
  const project = buildTsMorphProject(root);
  const barrel = project.addSourceFileAtPath(join(root, "subgraphs/index.ts"));
  return [...barrel.getExportedDeclarations()]
    .flatMap(([name, declarations]) =>
      declarations
        .filter(Node.isClassDeclaration)
        .map(
          (declaration) =>
            `${name}=${declaration.getName()}@${relative(root, declaration.getSourceFile().getFilePath())}`,
        ),
    )
    .sort();
}

describe("makeSubgraphsIndexFile with an authored root entry", () => {
  it("orders owned imports, exports, checks and void statements independently of source order", async () => {
    const root = makeProject([{ dir: "a", className: "ASubgraph" }]);
    writeFiles(root, {
      "subgraphs/index.ts": `void checkASubgraph;
const checkASubgraph: SubgraphCheck<typeof ASubgraph> = true;
export { ASubgraph };
import { ASubgraph } from "./a/index.js";
import type { SubgraphCheck } from "@powerhousedao/reactor-api";
`,
    });
    const expected = `import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { ASubgraph } from "./a/index.js";

export { ASubgraph };
const checkASubgraph: SubgraphCheck<typeof ASubgraph> = true;
void checkASubgraph;
`;

    expect(await regenerate(root)).toBe(expected);
    expect(await regenerate(root)).toBe(expected);
  });

  it("writes the generated barrel byte for byte", async () => {
    const root = makeProject([
      { dir: "statements", className: "StatementsSubgraph" },
      { dir: "transaction-ledger", className: "TransactionLedgerSubgraph" },
      { dir: "B-upper", className: "UpperSubgraph" },
    ]);

    expect(await regenerate(root))
      .toBe(`import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { UpperSubgraph } from "./B-upper/index.js";
import { StatementsSubgraph } from "./statements/index.js";
import { TransactionLedgerSubgraph } from "./transaction-ledger/index.js";

export { UpperSubgraph };
const checkUpperSubgraph: SubgraphCheck<typeof UpperSubgraph> = true;
void checkUpperSubgraph;

export { StatementsSubgraph };
const checkStatementsSubgraph: SubgraphCheck<typeof StatementsSubgraph> = true;
void checkStatementsSubgraph;

export { TransactionLedgerSubgraph };
const checkTransactionLedgerSubgraph: SubgraphCheck<
  typeof TransactionLedgerSubgraph
> = true;
void checkTransactionLedgerSubgraph;
`);
  });

  it("leaves a root that only declares its own class untouched", async () => {
    const root = makeProject([]);
    const barrel = `import { BaseSubgraph } from "../src/base.js";

export class RootSubgraph extends BaseSubgraph {
  static readonly subgraphName = "root";
}
`;
    writeFiles(root, {
      "src/base.ts": "export class BaseSubgraph {}\n",
      "subgraphs/index.ts": barrel,
    });
    const written = statSync(join(root, "subgraphs/index.ts")).mtimeMs;

    expect(await regenerate(root)).toBe(barrel);
    expect(statSync(join(root, "subgraphs/index.ts")).mtimeMs).toBe(written);
    expect(exportedClasses(root)).toStrictEqual([
      "RootSubgraph=RootSubgraph@subgraphs/index.ts",
    ]);
  });

  it("keeps a root class and a re-export from outside subgraphs/ while adding a subgraph", async () => {
    const root = makeProject([
      { dir: "statements", className: "StatementsSubgraph" },
    ]);
    writeFiles(root, {
      "src/base.ts": "export class BaseSubgraph {}\n",
      "src/external.ts": subgraphClass("ExternalSubgraph", "external"),
      "subgraphs/index.ts": `import { BaseSubgraph } from "../src/base.js";
export { ExternalSubgraph } from "../src/external.js";

export class RootSubgraph extends BaseSubgraph {
  static readonly subgraphName = "root";
}
`,
    });
    const expected = `import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { StatementsSubgraph } from "./statements/index.js";

import { BaseSubgraph } from "../src/base.js";
export { ExternalSubgraph } from "../src/external.js";

export class RootSubgraph extends BaseSubgraph {
  static readonly subgraphName = "root";
}

export { StatementsSubgraph };
const checkStatementsSubgraph: SubgraphCheck<typeof StatementsSubgraph> = true;
void checkStatementsSubgraph;
`;

    expect(await regenerate(root)).toBe(expected);
    expect(await regenerate(root)).toBe(expected);
    expect(exportedClasses(root)).toStrictEqual([
      "ExternalSubgraph=ExternalSubgraph@src/external.ts",
      "RootSubgraph=RootSubgraph@subgraphs/index.ts",
      "StatementsSubgraph=StatementsSubgraph@subgraphs/statements/index.ts",
    ]);
  });

  it("leaves a root that nests a class in a container untouched", async () => {
    const root = makeProject([]);
    const barrel = `import { DeepSubgraph } from "../src/deep.js";
export const nested = { child: { DeepSubgraph } };
`;
    writeFiles(root, {
      "src/deep.ts": subgraphClass("DeepSubgraph", "deep"),
      "subgraphs/index.ts": barrel,
    });
    const written = statSync(join(root, "subgraphs/index.ts")).mtimeMs;

    expect(await regenerate(root)).toBe(barrel);
    expect(statSync(join(root, "subgraphs/index.ts")).mtimeMs).toBe(written);
  });

  it("keeps the export aliases of two classes with the same name", async () => {
    const root = makeProject([]);
    writeFiles(root, {
      "subgraphs/one/index.ts": subgraphClass("SharedSubgraph", "one"),
      "subgraphs/two/index.ts": subgraphClass("SharedSubgraph", "two"),
      "subgraphs/index.ts": `import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { SharedSubgraph as One } from "./one/index.js";
import { SharedSubgraph as Two } from "./two/index.js";

export { One };
const checkOne: SubgraphCheck<typeof One> = true;
void checkOne;

export { Two };
`,
    });
    const expected = `import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { SharedSubgraph as One } from "./one/index.js";
import { SharedSubgraph as Two } from "./two/index.js";

export { One };
const checkOne: SubgraphCheck<typeof One> = true;
void checkOne;

export { Two };
const checkTwo: SubgraphCheck<typeof Two> = true;
void checkTwo;
`;

    expect(await regenerate(root)).toBe(expected);
    expect(await regenerate(root)).toBe(expected);
    expect(exportedClasses(root)).toStrictEqual([
      "One=SharedSubgraph@subgraphs/one/index.ts",
      "Two=SharedSubgraph@subgraphs/two/index.ts",
    ]);
  });

  it("derives a distinct export for a second class with the same name", async () => {
    const root = makeProject([]);
    writeFiles(root, {
      "subgraphs/one/index.ts": subgraphClass("SharedSubgraph", "one"),
      "subgraphs/two/index.ts": subgraphClass("SharedSubgraph", "two"),
    });

    expect(await regenerate(root))
      .toBe(`import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { SharedSubgraph } from "./one/index.js";
import { SharedSubgraph as TwoSharedSubgraph } from "./two/index.js";

export { SharedSubgraph };
const checkSharedSubgraph: SubgraphCheck<typeof SharedSubgraph> = true;
void checkSharedSubgraph;

export { TwoSharedSubgraph };
const checkTwoSharedSubgraph: SubgraphCheck<typeof TwoSharedSubgraph> = true;
void checkTwoSharedSubgraph;
`);
    expect(exportedClasses(root)).toStrictEqual([
      "SharedSubgraph=SharedSubgraph@subgraphs/one/index.ts",
      "TwoSharedSubgraph=SharedSubgraph@subgraphs/two/index.ts",
    ]);
  });

  it("names the generated bindings around the root's own", async () => {
    const root = makeProject([
      { dir: "statements", className: "StatementsSubgraph" },
    ]);
    writeFiles(root, {
      "subgraphs/index.ts": `const StatementsSubgraph = "taken";
const checkStatementsSubgraph = StatementsSubgraph;
export { checkStatementsSubgraph as label };
`,
    });

    expect(await regenerate(root))
      .toBe(`import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { StatementsSubgraph as StatementsSubgraph2 } from "./statements/index.js";

const StatementsSubgraph = "taken";
const checkStatementsSubgraph = StatementsSubgraph;
export { checkStatementsSubgraph as label };

export { StatementsSubgraph2 as StatementsSubgraph };
const checkStatementsSubgraph2: SubgraphCheck<typeof StatementsSubgraph2> =
  true;
void checkStatementsSubgraph2;
`);
    expect(exportedClasses(root)).toStrictEqual([
      "StatementsSubgraph=StatementsSubgraph@subgraphs/statements/index.ts",
    ]);
  });

  it("refuses a root that does not parse and leaves it unchanged", async () => {
    const root = makeProject([
      { dir: "statements", className: "StatementsSubgraph" },
    ]);
    const barrel = "export class Broken {\n";
    writeFiles(root, { "subgraphs/index.ts": barrel });
    const project = buildTsMorphProject(root);

    await expect(
      makeSubgraphsIndexFile({
        project,
        subgraphsDir: join(root, "subgraphs"),
      }),
    ).rejects.toThrow(
      "PH-IMPORT-FAILED [error/import] ./subgraphs/index.ts (root): subgraphs/index.ts does not parse, so its own statements cannot be told apart from generated ones. Received: '}' expected. Repair: Fix the syntax error in subgraphs/index.ts, then run the generator again.",
    );
    await project.save();
    expect(readFileSync(join(root, "subgraphs/index.ts"), "utf8")).toBe(barrel);
  });
});

describe("class subgraph templates", () => {
  const names = {
    pascalCaseName: "TodoList",
    camelCaseName: "todoList",
    kebabCaseName: "todo-list",
    itemTypeName: "TodoListSubgraphItem",
  };

  it("separates typed ph types from the class schema", () => {
    expect(subgraphSchemaTemplate(names)).toContain(
      'export const TodoListSubgraphItem = ph.object("TodoListSubgraphItem",',
    );
    const source = subgraphIndexFileTemplate(names);
    expect(source).toContain(
      'static override readonly subgraphName = "todo-list";',
    );
    expect(source).toContain(
      "static override getSchema(schema: SchemaBuilder<TodoListSubgraph>)",
    );
    expect(source).toContain('schema.query("todoListItem",');
    expect(source).toContain(
      "returns: ph.ref(TodoListSubgraphItem, { required: true })",
    );
  });
});

function expectCompiles(root: string) {
  writeFiles(root, {
    "node_modules/@powerhousedao/reactor-api/package.json":
      '{"name":"@powerhousedao/reactor-api","types":"index.d.ts"}',
    "node_modules/@powerhousedao/reactor-api/index.d.ts":
      "export type SubgraphCheck<T> = true;\n",
  });
  const project = new Project({
    tsConfigFilePath: join(root, "tsconfig.json"),
    compilerOptions: { types: [], noEmit: true, skipLibCheck: true },
  });
  expect(
    project
      .getPreEmitDiagnostics()
      .map((diagnostic) => diagnostic.getMessageText()),
  ).toEqual([]);
}

describe("barrel ownership regressions", () => {
  it("keeps authored check names and every reference", async () => {
    const root = makeProject([{ dir: "a", className: "ASubgraph" }]);
    writeFiles(root, {
      "subgraphs/index.ts": `import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { ASubgraph } from "./a/index.js";
const validation: SubgraphCheck<typeof ASubgraph> = true;
export { ASubgraph };
export { validation };
`,
    });
    const text = await regenerate(root);
    expect(text).toContain(
      "const validation: SubgraphCheck<typeof ASubgraph> = true;",
    );
    expect(text).toContain("export { validation };");
    expect(text).toContain("import type { SubgraphCheck }");
    expectCompiles(root);
    expect(await regenerate(root)).toBe(text);
  });

  it("aliases the helper type around authored bindings", async () => {
    const root = makeProject([{ dir: "a", className: "ASubgraph" }]);
    writeFiles(root, {
      "subgraphs/index.ts":
        'type SubgraphCheck = string;\nexport const info: SubgraphCheck = "ok";\n',
    });
    const text = await regenerate(root);
    expect(text).toContain("SubgraphCheck as SubgraphCheck2");
    expect(text).toContain("checkASubgraph: SubgraphCheck2<typeof ASubgraph>");
    expect(text).toContain("type SubgraphCheck = string;");
    expectCompiles(root);
    expect(await regenerate(root)).toBe(text);
    expect(await regenerate(root)).toBe(text);
  });

  it("adds a runtime export beside an individual type-only export", async () => {
    const root = makeProject([{ dir: "a", className: "ASubgraph" }]);
    writeFiles(root, {
      "subgraphs/index.ts": 'export { type ASubgraph } from "./a/index.js";\n',
    });
    const text = await regenerate(root);
    expect(text).toContain('export { type ASubgraph } from "./a/index.js";');
    expect(text).toContain("export { AASubgraph };");
    expect(text).toContain("checkAASubgraph:");
    expectCompiles(root);
    expect(exportedClasses(root)).toContain(
      "AASubgraph=ASubgraph@subgraphs/a/index.ts",
    );
    expect(await regenerate(root)).toBe(text);
  });

  it("ignores property names, declarations and labels when a generated binding disappears", async () => {
    const root = makeProject([]);
    writeFiles(root, {
      "subgraphs/index.ts": `import { GoneSubgraph } from "./gone/index.js";
export { GoneSubgraph };
export const config = { GoneSubgraph: "description" };
export const label = config.GoneSubgraph;
export function describe(GoneSubgraph: string) { return GoneSubgraph; }
`,
    });
    const text = await regenerate(root);
    expect(text).not.toContain('from "./gone/index.js"');
    expect(text).toContain(
      'export const config = { GoneSubgraph: "description" };',
    );
    expect(text).toContain("config.GoneSubgraph");
  });

  it.each(["GoneSubgraph", "checkGoneSubgraph"])(
    "refuses an authored reference to removed %s before writing",
    async (name) => {
      const root = makeProject([]);
      const before = `import { GoneSubgraph } from "./gone/index.js";
export { GoneSubgraph };
const checkGoneSubgraph: SubgraphCheck<typeof GoneSubgraph> = true;
void checkGoneSubgraph;
export const kept = ${name};
`;
      writeFiles(root, { "subgraphs/index.ts": before });
      await expect(regenerate(root)).rejects.toThrow(
        `authored reference to ${name}`,
      );
      expect(readFileSync(join(root, "subgraphs/index.ts"), "utf8")).toBe(
        before,
      );
    },
  );

  it("keeps every leading import comment when imports merge", async () => {
    const root = makeProject([{ dir: "a", className: "ZSubgraph" }]);
    const first = await regenerate(root);
    writeFiles(root, {
      "subgraphs/index.ts": first.replace(
        "import { ZSubgraph }",
        "// Keep the API import documented.\nimport { ZSubgraph }",
      ),
      "subgraphs/a/index.ts":
        subgraphClass("ZSubgraph", "z") +
        subgraphClass("ASubgraph", "a").replace("class BaseSubgraph {}\n", ""),
    });
    const text = await regenerate(root);
    expect(text).toContain(
      "// Keep the API import documented.\nimport { ASubgraph, ZSubgraph }",
    );
    expect(await regenerate(root)).toBe(text);
  });

  it("keeps trailing file text last across three regenerations", async () => {
    const root = makeProject([{ dir: "a", className: "ASubgraph" }]);
    const first = await regenerate(root);
    writeFiles(root, { "subgraphs/index.ts": first + "// keep me last\n" });
    const text = await regenerate(root);
    expect(text.endsWith("// keep me last\n")).toBe(true);
    expect(await regenerate(root)).toBe(text);
    expect(await regenerate(root)).toBe(text);
  });
});
