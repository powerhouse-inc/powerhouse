import { REACTOR_API_PACKAGE } from "@powerhousedao/shared/clis";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "ts-morph";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  generateAll,
  generateAllSubgraphs,
  generateSubgraph,
  generateSubgraphDir,
  migrate,
} from "../../src/codegen/index.js";
import { subgraphDirStyle } from "../../src/utils/index.mjs";
import {
  createPackage,
  inProject,
  readJson,
  removePackage,
  tree,
} from "./package.js";

/** Every code-first directory of the fixture; `shared` holds their base. */
const CODE_FIRST_DIRS = ["invoices", "renamed-orders", "reports", "shared"];

const dirs: string[] = [];
beforeAll(() => {
  // Defined at build time by tsdown; migrate maps over it.
  Object.assign(globalThis, { WORKSPACE_PACKAGES: [] });
});
afterEach(() => {
  for (const dir of dirs.splice(0)) removePackage(dir);
});

function write(dir: string, path: string, text: string) {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/**
 * Both styles in one project: a schema-first `ledger`, a code-first
 * `invoices`, a code-first `orders` whose directory was renamed, and a
 * code-first `reports` whose `Subgraph` comes through a shared base file.
 */
async function mixedProject() {
  const dir = await createPackage();
  dirs.push(dir);
  await inProject(dir, async (project) => {
    await generateSubgraph("ledger", project);
    await generateSubgraph("invoices", project, { codeFirst: true });
    await generateSubgraph("orders", project, { codeFirst: true });
  });
  renameSync(
    join(dir, "subgraphs/orders"),
    join(dir, "subgraphs/renamed-orders"),
  );
  write(
    dir,
    "subgraphs/shared/base.ts",
    `import { Subgraph } from "${REACTOR_API_PACKAGE}";\n\nexport abstract class AppSubgraph extends Subgraph {}\n`,
  );
  write(
    dir,
    "subgraphs/reports/index.ts",
    [
      `import { type SchemaBuilder } from "${REACTOR_API_PACKAGE}";`,
      'import { ph } from "document-model";',
      'import { AppSubgraph } from "../shared/base.js";',
      "",
      "export class ReportsSubgraph extends AppSubgraph {",
      '  static override readonly subgraphName = "reports";',
      "",
      "  static override getSchema(schema: SchemaBuilder<ReportsSubgraph>) {",
      "    return [",
      '      schema.query("reportCount", {',
      "        type: ph.Int({ required: true }),",
      "        resolve: () => 0,",
      "      }),",
      "    ];",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
  return { dir, before: tree(dir) };
}

const filesUnder = (files: Record<string, string>, subgraphDir: string) =>
  Object.fromEntries(
    Object.entries(files).filter(([path]) =>
      path.startsWith(`subgraphs/${subgraphDir}/`),
    ),
  );

function expectCodeFirstDirsUntouched(
  dir: string,
  before: Record<string, string>,
) {
  const after = tree(dir);
  for (const subgraphDir of CODE_FIRST_DIRS) {
    expect(filesUnder(after, subgraphDir)).toEqual(
      filesUnder(before, subgraphDir),
    );
    for (const [path, text] of Object.entries(filesUnder(after, subgraphDir))) {
      expect(text, path).not.toMatch(/\bgql\s*`/);
      expect(path).not.toMatch(/\/(lib|resolvers)\.ts$/);
    }
  }
  // The renamed directory keeps its path; its old one is not recreated.
  expect(existsSync(join(dir, "subgraphs/orders"))).toBe(false);
}

function expectRegistered(dir: string) {
  const barrel = tree(dir)["subgraphs/index.ts"];
  for (const line of [
    'export * as InvoicesSubgraph from "./invoices/index.js";',
    'export * as LedgerSubgraph from "./ledger/index.js";',
    // An existing line is never rewritten, as on main: renaming a directory
    // leaves its barrel line for the author to edit.
    'export * as OrdersSubgraph from "./orders/index.js";',
    'export * as ReportsSubgraph from "./reports/index.js";',
  ]) {
    expect(barrel).toContain(line);
  }
  expect(barrel).not.toContain("./renamed-orders/index.js");
  const ids = (
    readJson(dir, "powerhouse.manifest.json").subgraphs as { id: string }[]
  )
    .map(({ id }) => id)
    .sort();
  expect(ids).toEqual(["invoices", "ledger", "orders", "reports"]);
}

type Route = {
  route: string;
  run: (dir: string, project: Project) => Promise<unknown>;
};

const routes: Route[] = [
  {
    route: "ph generate subgraph --all",
    run: async (_dir, project) =>
      expect(await generateAllSubgraphs(project)).toEqual({
        subgraphNames: ["invoices", "ledger", "orders", "reports"],
        unreadableDirs: [],
      }),
  },
  { route: "ph generate --all", run: (_dir, project) => generateAll(project) },
  {
    route: "ph generate subgraph --dir, for every directory",
    run: async (_dir, project) => {
      const names = [];
      for (const dirName of ["invoices", "ledger", "renamed-orders", "reports"])
        names.push((await generateSubgraphDir(dirName, project)).subgraphName);
      expect(names).toEqual(["invoices", "ledger", "orders", "reports"]);
    },
  },
  {
    // --document and Vetra call generateSubgraph with the document's name.
    route: "ph generate subgraph --name/--document on existing subgraphs",
    run: async (_dir, project) => {
      for (const name of ["invoices", "ledger", "orders", "reports"])
        await generateSubgraph(name, project);
    },
  },
];

async function expectEachDirInItsOwnStyle(run: Route["run"]) {
  const { dir, before } = await mixedProject();
  await inProject(dir, (project) => run(dir, project));
  expectCodeFirstDirsUntouched(dir, before);
  expect(subgraphDirStyle(join(dir, "subgraphs"), "ledger")).toBe(
    "schema-first",
  );
  expect(Object.keys(filesUnder(tree(dir), "ledger")).sort()).toEqual([
    "subgraphs/ledger/index.ts",
    "subgraphs/ledger/lib.ts",
    "subgraphs/ledger/resolvers.ts",
    "subgraphs/ledger/schema.ts",
  ]);
  expectRegistered(dir);
}

describe("a project with both styles", () => {
  it.each(routes)("$route keeps each directory in its own style", ({ run }) =>
    expectEachDirInItsOwnStyle(run),
  );

  it("ph migrate's regeneration keeps each directory in its own style", async () => {
    const { dir, before } = await mixedProject();
    await migrate("6.2.3-dev.73", dir, { skipInstall: true });
    expectCodeFirstDirsUntouched(dir, before);
    expectRegistered(dir);
  });

  it("--name scaffolds a new subgraph schema first", async () => {
    const { dir, before } = await mixedProject();
    await inProject(dir, (project) => generateSubgraph("extra", project));
    expect(subgraphDirStyle(join(dir, "subgraphs"), "extra")).toBe(
      "schema-first",
    );
    expect(existsSync(join(dir, "subgraphs/extra/resolvers.ts"))).toBe(true);
    expectCodeFirstDirsUntouched(dir, before);
  });

  it("skips a code-first directory it cannot read, with nothing written", async () => {
    const { dir } = await mixedProject();
    const unreadable = `import { Subgraph } from "${REACTOR_API_PACKAGE}";\n\nconst name = "broken";\nexport class BrokenSubgraph extends Subgraph {\n  static override readonly subgraphName = name;\n}\n`;
    write(dir, "subgraphs/broken/index.ts", unreadable);
    const result = await inProject(dir, (project) =>
      generateAllSubgraphs(project),
    );
    expect(result.unreadableDirs).toEqual(["broken"]);
    expect(filesUnder(tree(dir), "broken")).toEqual({
      "subgraphs/broken/index.ts": unreadable,
    });
    await expect(
      inProject(dir, (project) => generateSubgraph("broken", project)),
    ).rejects.toThrow(
      "subgraphs/broken declares a class that extends Subgraph but none with a string literal `static subgraphName`",
    );
    expect(filesUnder(tree(dir), "broken")).toEqual({
      "subgraphs/broken/index.ts": unreadable,
    });
  });

  it("ph generate subgraph --dir regenerates a renamed directory under the name in its index.ts", async () => {
    const dir = await createPackage();
    dirs.push(dir);
    await inProject(dir, (project) => generateSubgraph("foo", project));
    renameSync(join(dir, "subgraphs/foo"), join(dir, "subgraphs/renamed"));
    const { subgraphName } = await inProject(dir, (project) =>
      generateSubgraphDir("renamed", project),
    );
    expect(subgraphName).toBe("foo");
    expect(Object.keys(filesUnder(tree(dir), "foo")).sort()).toEqual([
      "subgraphs/foo/index.ts",
      "subgraphs/foo/lib.ts",
      "subgraphs/foo/resolvers.ts",
      "subgraphs/foo/schema.ts",
    ]);
  });
});

describe("code-first classes the classifier must still see", () => {
  it("an anonymous default class: regeneration writes no SDL file and does not throw", async () => {
    const index = `import { Subgraph } from "${REACTOR_API_PACKAGE}";\nexport default class extends Subgraph {\n  static override readonly subgraphName = "items";\n}\n`;
    const dir = await createPackage();
    dirs.push(dir);
    write(dir, "subgraphs/items/index.ts", index);
    await inProject(dir, (project) => generateSubgraph("items", project));
    await inProject(dir, (project) => generateAllSubgraphs(project));
    expect(Object.keys(filesUnder(tree(dir), "items")).sort()).toEqual([
      "subgraphs/items/index.ts",
    ]);
    expect(tree(dir)["subgraphs/items/index.ts"]).toBe(index);
  });

  it("a class re-exported from another file: regeneration writes no SDL file and the barrel lists it", async () => {
    const index = 'export { ItemsSubgraph } from "./items.js";\n';
    const items = `import { Subgraph } from "${REACTOR_API_PACKAGE}";\nexport class ItemsSubgraph extends Subgraph {\n  static override readonly subgraphName = "items";\n}\n`;
    const dir = await createPackage();
    dirs.push(dir);
    write(dir, "subgraphs/items/index.ts", index);
    write(dir, "subgraphs/items/items.ts", items);
    await inProject(dir, (project) =>
      generateSubgraph("items", project, { codeFirst: true }),
    );
    await inProject(dir, (project) => generateAllSubgraphs(project));
    expect(filesUnder(tree(dir), "items")).toEqual({
      "subgraphs/items/index.ts": index,
      "subgraphs/items/items.ts": items,
    });
    expect(tree(dir)["subgraphs/index.ts"]).toContain(
      'export * as ItemsSubgraph from "./items/index.js";',
    );
  });

  it("a class in a subfolder re-exported by index.ts: the barrel names the top-level directory", async () => {
    const index = 'export { ItemsSubgraph } from "./src/items.js";\n';
    const items = `import { Subgraph } from "${REACTOR_API_PACKAGE}";\nexport class ItemsSubgraph extends Subgraph {\n  static override readonly subgraphName = "items";\n}\n`;
    const dir = await createPackage();
    dirs.push(dir);
    write(dir, "subgraphs/items/index.ts", index);
    write(dir, "subgraphs/items/src/items.ts", items);
    await inProject(dir, (project) => generateSubgraph("items", project));
    await inProject(dir, (project) => generateAllSubgraphs(project));
    expect(filesUnder(tree(dir), "items")).toEqual({
      "subgraphs/items/index.ts": index,
      "subgraphs/items/src/items.ts": items,
    });
    expect(tree(dir)["subgraphs/index.ts"]).toBe(
      'export * as ItemsSubgraph from "./items/index.js";\n',
    );
  });
});

describe("schema-first behavior next to code-first code", () => {
  const schemaFirstIndex = `import { BaseSubgraph } from "${REACTOR_API_PACKAGE}";\nimport { cents } from "../shared/money.js";\n\nexport class SdlSubgraph extends BaseSubgraph {\n  name = "sdl";\n  rate = cents(1);\n}\n`;

  it("regenerates a BaseSubgraph that imports a helper from a module holding a code-first base", async () => {
    const dir = await createPackage();
    dirs.push(dir);
    write(
      dir,
      "subgraphs/shared/money.ts",
      `import { Subgraph } from "${REACTOR_API_PACKAGE}";\nexport const cents = (n: number) => n * 100;\nexport abstract class ShopBase extends Subgraph {}\n`,
    );
    write(dir, "subgraphs/sdl/index.ts", schemaFirstIndex);
    expect(subgraphDirStyle(join(dir, "subgraphs"), "sdl")).toBe(
      "schema-first",
    );
    const result = await inProject(dir, (project) =>
      generateAllSubgraphs(project),
    );
    expect(result).toEqual({ subgraphNames: ["sdl"], unreadableDirs: [] });
    expect(Object.keys(filesUnder(tree(dir), "sdl")).sort()).toEqual([
      "subgraphs/sdl/index.ts",
      "subgraphs/sdl/lib.ts",
      "subgraphs/sdl/resolvers.ts",
      "subgraphs/sdl/schema.ts",
    ]);
    expect(tree(dir)["subgraphs/sdl/index.ts"]).toBe(schemaFirstIndex);
    expect(tree(dir)["subgraphs/index.ts"]).toBe(
      'export * as SdlSubgraph from "./sdl/index.js";\n',
    );
    await inProject(dir, (project) => generateSubgraph("sdl", project));
    expect(tree(dir)["subgraphs/sdl/index.ts"]).toBe(schemaFirstIndex);
  });

  it("keeps a hand-written barrel line byte for byte", async () => {
    const dir = await createPackage();
    dirs.push(dir);
    await inProject(dir, (project) => generateSubgraph("foo", project));
    const handWritten = 'export * as FooSubgraph from "./foo";\n';
    write(dir, "subgraphs/index.ts", handWritten);
    await inProject(dir, (project) => generateSubgraph("bar", project));
    expect(tree(dir)["subgraphs/index.ts"]).toBe(
      `export * as BarSubgraph from "./bar/index.js";\n${handWritten}`,
    );
    await inProject(dir, (project) => generateAllSubgraphs(project));
    expect(tree(dir)["subgraphs/index.ts"]).toBe(
      `export * as BarSubgraph from "./bar/index.js";\n${handWritten}`,
    );
  });
});

describe("powerhouse.config.json and ph generate subgraph --name", () => {
  it("is never read: --name scaffolds schema first and --code-first code first", async () => {
    const dir = await createPackage();
    dirs.push(dir);
    await inProject(dir, (project) => generateSubgraph("foo", project));
    for (const file of ["index.ts", "lib.ts", "schema.ts", "resolvers.ts"])
      write(dir, `subgraphs/foo/${file}`, `// edited ${file}\n`);
    write(dir, "subgraphs/index.ts", "// edited barrel\n");
    const before = tree(dir);
    writeFileSync(join(dir, "powerhouse.config.json"), "{ not json");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await inProject(dir, (project) => generateSubgraph("foo", project));
      expect(tree(dir)).toEqual({
        ...before,
        "powerhouse.config.json": "{ not json",
      });
      await inProject(dir, async (project) => {
        await generateSubgraph("bar", project, { codeFirst: true });
        await generateSubgraph("baz", project);
      });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    expect(subgraphDirStyle(join(dir, "subgraphs"), "bar")).toBe("code-first");
    expect(subgraphDirStyle(join(dir, "subgraphs"), "baz")).toBe(
      "schema-first",
    );
  });
});
