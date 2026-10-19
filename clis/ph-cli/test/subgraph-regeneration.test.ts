import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDocument } from "@powerhousedao/vetra/codegen";
import { assertIsSubgraphModuleDocument } from "@powerhousedao/vetra/document-models/subgraph-module";
import { materializeFixturePackage } from "../../../packages/document-model/test/tooling/loader-contract.js";

const REPOSITORY = resolve(import.meta.dirname, "..", "..", "..");
const REACTOR_API = join(REPOSITORY, "packages", "reactor-api");
const CLI = resolve(import.meta.dirname, "../dist/cli.mjs");

const disposals: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

function subgraphPackage(files: Record<string, string>) {
  const { root, dispose } = materializeFixturePackage("configs");
  disposals.push(dispose);
  const write = (file: string, text: string) => {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  write("powerhouse.config.json", "{}");
  write(
    "package.json",
    JSON.stringify({
      name: "@acme/subgraphs",
      version: "0.0.0",
      type: "module",
      peerDependencies: {
        "document-model": "6.2.3",
        "@powerhousedao/reactor-api": "6.2.3",
      },
    }),
  );
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        rootDir: ".",
        module: "nodenext",
        moduleResolution: "nodenext",
        target: "esnext",
        strict: true,
        noImplicitOverride: true,
        skipLibCheck: true,
      },
      include: ["src/**/*.ts", "subgraphs/**/*.ts"],
    }),
  );
  const modules = join(root, "node_modules");
  mkdirSync(join(modules, "@powerhousedao"), { recursive: true });
  symlinkSync(REACTOR_API, join(modules, "@powerhousedao", "reactor-api"));
  symlinkSync(
    join(REPOSITORY, "packages", "shared"),
    join(modules, "@powerhousedao", "shared"),
  );
  for (const name of ["graphql", "pg"]) {
    symlinkSync(
      realpathSync(join(REACTOR_API, "node_modules", name)),
      join(modules, name),
    );
  }
  for (const [file, text] of Object.entries(files)) write(file, text);
  return root;
}

function run(root: string, command: string[]) {
  const result = spawnSync(process.execPath, [CLI, ...command], {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

function checkedSubgraphs(root: string) {
  const { status, output } = run(root, ["model", "check", "--json"]);
  expect(status, output).toBe(0);
  const report = JSON.parse(output) as {
    definitions: {
      kind: string;
      key: string;
      source: { specifier: string; exportPath?: string[] };
    }[];
  };
  return report.definitions
    .filter(({ kind }) => kind === "subgraph")
    .map(
      ({ key, source }) =>
        `${key}@${source.specifier}#${(source.exportPath ?? []).join(".")}`,
    );
}

function regenerate(root: string) {
  const { status, output } = run(root, [
    "generate",
    "subgraph",
    "--all",
    "--skip-install",
  ]);
  expect(status, output).toBe(0);
  return readFileSync(join(root, "subgraphs/index.ts"), "utf8");
}

const subgraphClass = (className: string, subgraphName: string) =>
  `import { BaseSubgraph, type SchemaBuilder } from "@powerhousedao/reactor-api";
import { ph } from "document-model";

export class ${className} extends BaseSubgraph {
  static override readonly subgraphName = "${subgraphName}";
  static override getSchema(schema: SchemaBuilder<${className}>) {
    return [
      schema.query("${subgraphName}", { returns: ph.String(), resolve: () => "ok" }),
    ];
  }
}
`;

describe("built CLI regenerating an authored subgraphs/index.ts", () => {
  it("regenerates a computed name through --all while keeping --dir literal-only", () => {
    const source = subgraphClass("ComputedSubgraph", "computed").replace(
      '= "computed";',
      '= ["com", "puted"].join("");',
    );
    const root = subgraphPackage({
      "subgraphs/computed/index.ts": source,
      "subgraphs/index.ts":
        'export { ComputedSubgraph } from "./computed/index.js";\n',
    });
    expect(checkedSubgraphs(root)).toStrictEqual([
      "computed@./subgraphs/index.ts#ComputedSubgraph",
    ]);
    const byDir = run(root, [
      "generate",
      "subgraph",
      "--dir",
      "subgraphs/computed",
      "--skip-install",
    ]);
    expect(byDir.status, byDir.output).toBe(1);
    expect(byDir.output).toContain("so --dir cannot read it");
    expect(regenerate(root)).toBe(
      'export { ComputedSubgraph } from "./computed/index.js";\n',
    );
    expect(
      JSON.parse(readFileSync(join(root, "powerhouse.manifest.json"), "utf8")),
    ).toHaveProperty("subgraphs", [{ id: "computed", name: "computed" }]);
    expect(
      readFileSync(join(root, "subgraphs/computed/index.ts"), "utf8"),
    ).toBe(source);
  }, 240_000);

  it("extracts a subgraph document with its exact name and confirmed status", async () => {
    const root = subgraphPackage({
      "subgraphs/billing/index.ts": subgraphClass("BillingSubgraph", "billing"),
    });
    const result = run(root, ["generate", "subgraph", "--extract"]);
    expect(result.status, result.output).toBe(0);
    const spec = join(root, "specs", "subgraphs", "billing.subgraph.phd");
    expect(result.output).toContain(`Wrote ${spec}`);
    const doc = await getDocument(spec);
    assertIsSubgraphModuleDocument(doc);
    expect(doc.header.name).toBe("billing");
    expect(doc.state.global).toStrictEqual({
      name: "billing",
      status: "CONFIRMED",
    });
  }, 240_000);

  it("keeps a class declared in the root entry", () => {
    const barrel = subgraphClass("RootSubgraph", "root");
    const root = subgraphPackage({ "subgraphs/index.ts": barrel });
    const before = ["root@./subgraphs/index.ts#RootSubgraph"];
    expect(checkedSubgraphs(root)).toStrictEqual(before);

    expect(regenerate(root)).toBe(barrel);
    expect(checkedSubgraphs(root)).toStrictEqual(before);
  }, 240_000);

  it("keeps a re-export of a class declared outside subgraphs/", () => {
    const root = subgraphPackage({
      "src/external.ts": subgraphClass("ExternalSubgraph", "external"),
      "subgraphs/billing/index.ts": subgraphClass("BillingSubgraph", "billing"),
      "subgraphs/index.ts": `export { ExternalSubgraph } from "../src/external.js";\n`,
    });

    expect(regenerate(root))
      .toBe(`import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { BillingSubgraph } from "./billing/index.js";

export { ExternalSubgraph } from "../src/external.js";

export { BillingSubgraph };
const checkBillingSubgraph: SubgraphCheck<typeof BillingSubgraph> = true;
void checkBillingSubgraph;
`);
    expect(checkedSubgraphs(root)).toStrictEqual([
      "billing@./subgraphs/index.ts#BillingSubgraph",
      "external@./subgraphs/index.ts#ExternalSubgraph",
    ]);
  }, 240_000);

  it("keeps a class nested in an exported container", () => {
    const barrel = `import { DeepSubgraph } from "../src/deep.js";
export const nested = { child: { DeepSubgraph } };
`;
    const root = subgraphPackage({
      "src/deep.ts": subgraphClass("DeepSubgraph", "deep"),
      "subgraphs/index.ts": barrel,
    });
    const before = ["deep@./subgraphs/index.ts#nested.child.DeepSubgraph"];
    expect(checkedSubgraphs(root)).toStrictEqual(before);

    expect(regenerate(root)).toBe(barrel);
    expect(checkedSubgraphs(root)).toStrictEqual(before);
  }, 240_000);

  it("keeps two classes with the same name under their aliases", () => {
    const barrel = `export { SharedSubgraph as One } from "./one/index.js";
export { SharedSubgraph as Two } from "./two/index.js";
`;
    const root = subgraphPackage({
      "subgraphs/one/index.ts": subgraphClass("SharedSubgraph", "one"),
      "subgraphs/two/index.ts": subgraphClass("SharedSubgraph", "two"),
      "subgraphs/index.ts": barrel,
    });
    const before = [
      "one@./subgraphs/index.ts#One",
      "two@./subgraphs/index.ts#Two",
    ];
    expect(checkedSubgraphs(root)).toStrictEqual(before);

    expect(regenerate(root)).toBe(barrel);
    expect(checkedSubgraphs(root)).toStrictEqual(before);
  }, 240_000);
});
