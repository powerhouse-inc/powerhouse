import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import { generateAllSubgraphs, generateSubgraph } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { materializeFixturePackage } from "../../../packages/document-model/test/tooling/loader-contract.js";
import { logBuildReport, runBuild, runPrepack } from "../src/services/build.js";
import {
  createGenerationSteps,
  createTypecheckStep,
} from "../src/services/definitions/build-steps.js";
import { runModelCheck } from "../src/services/model-check.js";
import { runSubgraphInspect } from "../src/services/model-inspect.js";
import type { ModelCheckArgs } from "../src/types.js";
import { recorder } from "./helpers/recorder.js";
import { recordStreams } from "./helpers/streams.js";

const REPOSITORY = resolve(import.meta.dirname, "..", "..", "..");
const REACTOR_API = join(REPOSITORY, "packages", "reactor-api");

const disposals: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

type Touched = { touched?: string[] };

function subgraphPackage(
  fixture: "control" | "schema-first" | "configs",
  config: object | undefined,
): {
  readonly root: string;
  readonly write: (file: string, text: string) => void;
} {
  const { root, dispose } = materializeFixturePackage(fixture);
  disposals.push(dispose);
  const write = (file: string, text: string) => {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  if (config !== undefined) {
    write("powerhouse.config.json", JSON.stringify(config));
  }
  write(
    "package.json",
    JSON.stringify({
      name: "@acme/subgraphs",
      version: "0.0.0",
      type: "module",
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
        declaration: true,
        declarationDir: "./dist/types",
        emitDeclarationOnly: true,
        incremental: true,
        strict: false,
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
  return { root, write };
}

const FRAGMENT = `import type { BaseSubgraph, SchemaBuilder } from "@powerhousedao/reactor-api";
import { ph } from "document-model";

export function healthField<T extends BaseSubgraph>(
  schema: SchemaBuilder<T>,
  name: string,
) {
  return schema.query(name, {
    returns: ph.String({ required: true }),
    resolve: () => "ok",
  });
}
`;

const SHARED_BASE = `import { BaseSubgraph, type SchemaBuilder } from "@powerhousedao/reactor-api";
import { healthField } from "./fragments.js";

export abstract class AcmeBase extends BaseSubgraph {
  static override getSchema(schema: SchemaBuilder<AcmeBase>) {
    return [healthField(schema, "acmeHealth")];
  }
}
`;

const REPORTS = `import pg from "pg";
import type { SubgraphArgs } from "@powerhousedao/reactor-api";
import type { SchemaBuilder } from "@powerhousedao/reactor-api";
import { ph } from "document-model";
import { AcmeBase } from "../shared/base.js";

const touched = ((globalThis as { touched?: string[] }).touched ??= []);

export const driver = typeof pg.Pool;

export class ReportsSubgraph extends AcmeBase {
  static override readonly subgraphName = "reports";

  static override getSchema(schema: SchemaBuilder<ReportsSubgraph>) {
    return [
      ...super.getSchema(schema),
      schema.query("report", {
        returns: ph.String({ required: true }),
        resolve: () => {
          touched.push("resolve");
          return "report";
        },
      }),
    ];
  }

  constructor(args: SubgraphArgs) {
    super(args);
    touched.push("constructor");
  }

  override async onSetup(): Promise<void> {
    touched.push("onSetup");
    await super.onSetup();
  }
}
`;

const OLD_STYLE = `import { BaseSubgraph } from "@powerhousedao/reactor-api";

export class LegacySubgraph extends BaseSubgraph {
  name = "legacy";
}
`;

const MIXED = `import { BaseSubgraph, type SchemaBuilder } from "@powerhousedao/reactor-api";
import { ph } from "document-model";

export class MixedSubgraph extends BaseSubgraph {
  override name = "old";
  static override readonly subgraphName = "mixed";
  constructor() {
    super();
    ((globalThis as { touched?: string[] }).touched ??= []).push("new");
  }
  static override getSchema(schema: SchemaBuilder<MixedSubgraph>) {
    return [schema.query("ping", { returns: ph.String(), resolve: () => "ok" })];
  }
}
`;

const DEEP = `import { BaseSubgraph, type SchemaBuilder } from "@powerhousedao/reactor-api";
import { ph } from "document-model";

export class DeepSubgraph extends BaseSubgraph {
  static override readonly subgraphName = "deep";
  static override getSchema(schema: SchemaBuilder<DeepSubgraph>) {
    return [schema.query("deep", { returns: ph.String(), resolve: () => "ok" })];
  }
}
`;

const TAKEN_TYPE = `import { BaseSubgraph, type SchemaBuilder } from "@powerhousedao/reactor-api";
import { ph } from "document-model";

const Invoice = ph.object("Invoice", { fields: { id: ph.OID({ required: true }) } });

export class InvoiceViewSubgraph extends BaseSubgraph {
  static override readonly subgraphName = "invoice-view";
  static override getSchema(schema: SchemaBuilder<InvoiceViewSubgraph>) {
    return [
      schema.query("invoiceView", {
        returns: ph.ref(Invoice),
        resolve: () => null,
      }),
    ];
  }
}
`;

const MIGRATION_MESSAGE =
  "LegacySubgraph has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.";

async function withSubgraphs(
  root: string,
  write: (f: string, t: string) => void,
) {
  const project = buildTsMorphProject(root);
  await generateSubgraph("billing", project);
  await project.save();
  write("subgraphs/shared/fragments.ts", FRAGMENT);
  write("subgraphs/shared/base.ts", SHARED_BASE);
  write("subgraphs/reports/index.ts", REPORTS);
  const again = buildTsMorphProject(root);
  delete (globalThis as Touched).touched;
  await generateAllSubgraphs(again);
  await again.save();
  expect((globalThis as Touched).touched).toEqual([]);
}

function buildArgs(root: string) {
  return {
    outDir: "dist",
    debug: false,
    configFile: join(root, "powerhouse.config.json"),
    source: [] as string[],
    warningsAsErrors: false,
    noSharedDeps: false,
    ignoreTypeErrors: false,
  };
}

function checkArgs(root: string): ModelCheckArgs {
  return {
    configFile: join(root, "powerhouse.config.json"),
    source: [],
    outDir: "dist",
    json: true,
    jsonLines: false,
    release: false,
    watch: false,
    warningsAsErrors: false,
    debug: undefined,
  };
}

async function modelCheck(root: string) {
  const io = recordStreams();
  const code = await runModelCheck(checkArgs(root), { streams: io.streams });
  return {
    code,
    report: JSON.parse(io.stdout) as DefinitionCheckReport,
    stderr: io.stderr,
  };
}

const HOST_ENV = /^(PG|DATABASE_URL$|PH_)/;

async function withoutHostEnv<T>(work: () => Promise<T>): Promise<T> {
  const saved = Object.entries(process.env).filter(([key]) =>
    HOST_ENV.test(key),
  );
  for (const [key] of saved) delete process.env[key];
  try {
    return await work();
  } finally {
    for (const [key, value] of saved) process.env[key] = value;
  }
}

const subgraphKeys = (report: DefinitionCheckReport | undefined) =>
  report?.definitions
    .filter(({ kind }) => kind === "subgraph")
    .map(({ key }) => key);

describe("ph model check reads subgraphs through the protocol", () => {
  it("checks a package without definitionSources, with a shared base, a fragment and pg, constructing nothing", async () => {
    const { root, write } = subgraphPackage("configs", {});
    await withSubgraphs(root, write);
    delete (globalThis as Touched).touched;

    const { code, report } = await withoutHostEnv(() => modelCheck(root));

    expect(report.diagnostics).toEqual([]);
    expect([code, report.status, subgraphKeys(report)]).toEqual([
      0,
      "ok",
      ["billing", "reports"],
    ]);
    expect((globalThis as Touched).touched).toEqual([]);
  }, 180_000);

  it("logs an exported shared base once while keeping JSON output valid", async () => {
    const { root, write } = subgraphPackage("configs", {});
    await withSubgraphs(root, write);
    write(
      "subgraphs/index.ts",
      readFileSync(join(root, "subgraphs/index.ts"), "utf8") +
        '\nexport { AcmeBase } from "./shared/base.js";\n',
    );

    const { code, report, stderr } = await modelCheck(root);

    expect([code, report.status, subgraphKeys(report)]).toEqual([
      0,
      "ok",
      ["billing", "reports"],
    ]);
    expect(
      stderr
        .split("\n")
        .filter((line) => line.includes("shared subgraph base")),
    ).toEqual(["ℹ AcmeBase is accepted as a shared subgraph base."]);
  }, 180_000);

  it("rejects an old-style subgraph with the migration message", async () => {
    const { root, write } = subgraphPackage("configs", {});
    write("subgraphs/legacy/index.ts", OLD_STYLE);

    const { code, report } = await modelCheck(root);

    expect([code, report.status]).toEqual([1, "invalid"]);
    expect(
      report.diagnostics.map(({ code: id, message, source }) => ({
        id,
        message,
        source,
      })),
    ).toEqual([
      {
        id: "PH-SG-DEFINITION-INVALID",
        message: MIGRATION_MESSAGE,
        source: {
          specifier: "./subgraphs/legacy/index.ts",
          exportPath: ["LegacySubgraph"],
        },
      },
    ]);
  }, 180_000);

  it("rejects a class subgraph that also declares an old-style field, constructing nothing", async () => {
    const { root, write } = subgraphPackage("configs", {});
    write("subgraphs/mixed/index.ts", MIXED);
    delete (globalThis as Touched).touched;

    const { code, report } = await modelCheck(root);

    expect([code, report.status]).toEqual([1, "invalid"]);
    expect(
      report.diagnostics.map(({ code: id, message, repair, source }) => ({
        id,
        message,
        repair,
        source,
      })),
    ).toEqual([
      {
        id: "PH-SG-DEFINITION-INVALID",
        message:
          'MixedSubgraph declares static subgraphName "mixed" and the old-style field name, which the host refuses.',
        repair:
          "Remove it and declare the schema in static getSchema. Run ph migrate to convert an old-style subgraph.",
        source: {
          specifier: "./subgraphs/mixed/index.ts",
          exportPath: ["MixedSubgraph"],
        },
      },
    ]);
    expect((globalThis as Touched).touched).toBeUndefined();
  }, 180_000);

  it("checks a class the root entry exports through nested containers", async () => {
    const { root, write } = subgraphPackage("configs", {});
    write("src/deep.ts", DEEP);
    write(
      "subgraphs/index.ts",
      'import { DeepSubgraph } from "../src/deep.js";\nexport const nested = { child: { DeepSubgraph } };\n',
    );

    const { code, report } = await modelCheck(root);

    expect(report.diagnostics).toEqual([]);
    expect([code, report.status, subgraphKeys(report)]).toEqual([
      0,
      "ok",
      ["deep"],
    ]);
  }, 180_000);

  it("warns about a subgraph definitionSources lists and checks it once", async () => {
    const { root, write } = subgraphPackage("control", undefined);
    await withSubgraphs(root, write);
    const config = JSON.parse(
      readFileSync(join(root, "powerhouse.config.json"), "utf8"),
    ) as { definitionSources: { entries: object[] } };
    config.definitionSources.entries.push({
      specifier: "./subgraphs/billing/index.ts",
    });
    write("powerhouse.config.json", JSON.stringify(config));

    const { code, report } = await modelCheck(root);

    expect([code, report.status, subgraphKeys(report)]).toEqual([
      0,
      "ok",
      ["billing", "reports"],
    ]);
    expect(
      report.diagnostics.map(({ code: id, severity }) => [id, severity]),
    ).toEqual([["PH-CONFIG-SOURCE-SUBGRAPH-IGNORED", "warning"]]);
  }, 180_000);

  it("surfaces the parent fields a child's getSchema drops as a warning", async () => {
    const { root, write } = subgraphPackage("configs", {});
    write("subgraphs/shared/fragments.ts", FRAGMENT);
    write("subgraphs/shared/base.ts", SHARED_BASE);
    write(
      "subgraphs/narrow/index.ts",
      `import type { SchemaBuilder } from "@powerhousedao/reactor-api";
import { ph } from "document-model";
import { AcmeBase } from "../shared/base.js";

export class NarrowSubgraph extends AcmeBase {
  static override readonly subgraphName = "narrow";
  static override getSchema(schema: SchemaBuilder<NarrowSubgraph>) {
    return [schema.query("narrow", { returns: ph.String(), resolve: () => "n" })];
  }
}
`,
    );

    const { code, report } = await modelCheck(root);

    expect([code, report.status]).toEqual([0, "ok"]);
    expect(
      report.diagnostics.map(({ code: id, severity, message }) => ({
        id,
        severity,
        message,
      })),
    ).toEqual([
      {
        id: "PH-SG-PARENT-FIELDS-DROPPED",
        severity: "warning",
        message:
          "NarrowSubgraph.getSchema drops Query.acmeHealth, which AcmeBase.getSchema declares.",
      },
    ]);
  }, 180_000);
});

describe("ph subgraph inspect", () => {
  it("reads the definition through the protocol without constructing the class", async () => {
    const { root, write } = subgraphPackage("configs", {});
    await withSubgraphs(root, write);
    delete (globalThis as Touched).touched;
    const io = recordStreams();

    const code = await runSubgraphInspect(
      {
        selector: "reports",
        configFile: join(root, "powerhouse.config.json"),
        source: [],
        json: true,
        debug: undefined,
      },
      io,
    );

    const envelope = JSON.parse(io.stdout) as {
      status: string;
      definition?: { name: string; schemaKind: string };
    };
    expect([code, envelope.status, envelope.definition?.name]).toEqual([
      0,
      "ok",
      "reports",
    ]);
    expect(envelope.definition?.schemaKind).toBe("typed");
    expect((globalThis as Touched).touched).toEqual([]);
  }, 180_000);
});

describe("ph build recognizes subgraphs through the subgraph entries", () => {
  async function build(root: string) {
    const log: string[] = [];
    const result = await runBuild(buildArgs(root), {
      steps: recorder().steps,
      log: (text) => log.push(text),
    });
    return { result, log: log.join("") };
  }

  it.each([
    ["without definitionSources", "configs", {}],
    ["with schema-first document models", "schema-first", undefined],
    ["with code-first document models", "control", undefined],
  ] as const)(
    "passes a package %s and lists every subgraph",
    async (_, fixture, config) => {
      const { root, write } = subgraphPackage(fixture, config);
      await withSubgraphs(root, write);

      const { result } = await withoutHostEnv(() => build(root));

      expect(result.report?.diagnostics).toEqual([]);
      expect([result.status, subgraphKeys(result.report)]).toEqual([
        "ok",
        ["billing", "reports"],
      ]);
      expect(
        (
          JSON.parse(
            readFileSync(join(root, "powerhouse.manifest.json"), "utf8"),
          ) as { subgraphs: { id: string }[] }
        ).subgraphs.map(({ id }) => id),
      ).toEqual(["billing", "reports"]);
    },
    240_000,
  );

  it("prints a passing build's composition warnings", async () => {
    const { root, write } = subgraphPackage("control", undefined);
    write("subgraphs/invoice-view/index.ts", TAKEN_TYPE);

    const { result } = await withoutHostEnv(() => build(root));
    const printed: string[] = [];
    await logBuildReport(result, (text) => printed.push(text));

    expect(result.status).toBe("ok");
    expect(printed).toEqual([
      expect.stringMatching(
        /^⚠ PH-SG-GENERATED-TYPE-TAKEN \[warning\/.*Subgraph "invoice-view" defines Invoice, which document model "Invoice" generates, so the server refuses it\./,
      ),
    ]);
  }, 240_000);

  it("warns about and ignores subgraphs an old definitionSources lists", async () => {
    const { root, write } = subgraphPackage("control", undefined);
    await withSubgraphs(root, write);
    const config = JSON.parse(
      readFileSync(join(root, "powerhouse.config.json"), "utf8"),
    ) as { definitionSources: { entries: object[] } };
    config.definitionSources.entries.push(
      { specifier: "./subgraphs/billing/index.ts" },
      { specifier: "./subgraphs/reports/index.ts" },
    );
    write("powerhouse.config.json", JSON.stringify(config));

    const { result } = await build(root);

    expect([result.status, subgraphKeys(result.report)]).toEqual([
      "ok",
      ["billing", "reports"],
    ]);
    expect(result.report?.diagnostics.map(({ code }) => code)).toEqual([
      "PH-CONFIG-SOURCE-SUBGRAPH-IGNORED",
      "PH-CONFIG-SOURCE-SUBGRAPH-IGNORED",
    ]);
  }, 240_000);

  it("lists in the built manifest a checked subgraph the source manifest leaves out", async () => {
    const { root, write } = subgraphPackage("configs", {});
    await withSubgraphs(root, write);
    const source = JSON.stringify({
      name: "@acme/subgraphs",
      subgraphs: [{ id: "billing", name: "Billing" }],
    });
    write("powerhouse.manifest.json", source);
    write("index.ts", "export {};\n");
    const steps = {
      ...recorder().steps,
      emitCandidate: (await createGenerationSteps()).emitCandidate,
    };

    const result = await runBuild(buildArgs(root), {
      steps,
      log: () => {},
    });

    expect(result.status).toBe("ok");
    expect(
      (
        JSON.parse(
          readFileSync(join(root, "dist", "powerhouse.manifest.json"), "utf8"),
        ) as { subgraphs: unknown[] }
      ).subgraphs,
    ).toEqual([
      { id: "billing", name: "Billing" },
      { id: "reports", name: "reports" },
    ]);
    expect(readFileSync(join(root, "powerhouse.manifest.json"), "utf8")).toBe(
      source,
    );
  }, 240_000);

  it("fails prepack on an old-style subgraph with the migration hint", async () => {
    const { root, write } = subgraphPackage("configs", {});
    write("subgraphs/legacy/index.ts", OLD_STYLE);
    const log: string[] = [];

    const result = await runPrepack(buildArgs(root), {
      steps: recorder().steps,
      log: (text) => log.push(text),
    });

    expect([result.status, result.exitCode]).toEqual(["failed", 2]);
    expect(log.join("")).toContain(
      "Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
    );
  }, 240_000);

  it("fails on an old-style subgraph at the tombstone it assigns, with the migration hint", async () => {
    const { root, write } = subgraphPackage("configs", {});
    write("subgraphs/legacy/index.ts", OLD_STYLE);

    const { result, log } = await build(root);

    expect([result.status, result.exitCode]).toEqual(["failed", 2]);
    expect(log).toContain("✘ TypeScript failed; no definition was evaluated.");
    expect(log).toContain(
      "subgraphs/legacy/index.ts(4,3): error TS2416: Property 'name' in type 'LegacySubgraph' is not assignable to the same property in base type 'BaseSubgraph<",
    );
    expect(log).toContain("Type 'string' is not assignable to type 'never'.");
    expect(log).toContain(
      "✘ subgraphs/legacy/index.ts declares the old-style subgraph field name. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.\n",
    );
  }, 240_000);

  it("fails on an old-style subgraph with the migration message when type errors are ignored", async () => {
    const { root, write } = subgraphPackage("configs", {});
    write("subgraphs/legacy/index.ts", OLD_STYLE);

    const result = await runBuild(buildArgs(root), {
      steps: {
        ...recorder().steps,
        typecheck: createTypecheckStep("npm", { ignoreTypeErrors: true }),
      },
      log: () => {},
    });

    expect([result.status, result.exitCode]).toEqual(["invalid", 1]);
    expect(result.report?.diagnostics.map(({ message }) => message)).toEqual([
      MIGRATION_MESSAGE,
    ]);
  }, 240_000);
});

describe("built CLI on an old-style subgraph", () => {
  const cli = resolve(import.meta.dirname, "../dist/cli.mjs");
  const run = (root: string, command: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...command], {
      cwd: root,
      encoding: "utf8",
      timeout: 180_000,
      env: { ...process.env, NO_COLOR: "1", CI: "1" },
    });
    return { status: result.status, output: result.stdout + result.stderr };
  };

  it("fails generate document-model --all with the migration message", () => {
    const { root, write } = subgraphPackage("configs", {});
    write("subgraphs/legacy/index.ts", OLD_STYLE);
    mkdirSync(join(root, "document-models"), { recursive: true });

    const { status, output } = run(root, [
      "generate",
      "document-model",
      "--all",
    ]);

    expect(status, output).toBe(1);
    expect(output).toContain(`✘ PH-SG-DEFINITION-INVALID`);
    expect(output).toContain(MIGRATION_MESSAGE);
  }, 240_000);

  it("fails the default build with the migration hint", () => {
    const { root, write } = subgraphPackage("configs", {});
    write("subgraphs/legacy/index.ts", OLD_STYLE);

    const { status, output } = run(root, ["build"]);

    expect(status, output).toBe(2);
    expect(output).toContain(
      "✘ subgraphs/legacy/index.ts declares the old-style subgraph field name. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.\n",
    );
  }, 240_000);
});

describe("real ph build with shared subgraph capabilities", () => {
  it("builds two subgraphs and emits declarations for their base and fragments", async () => {
    const { root, write } = subgraphPackage("configs", {});
    write(
      "package.json",
      JSON.stringify({
        name: "@acme/subgraphs",
        version: "0.0.0",
        type: "module",
        files: ["dist"],
        exports: {
          ".": {
            types: "./dist/types/index.d.ts",
            browser: "./dist/browser/index.js",
            import: "./dist/node/index.mjs",
          },
          "./subgraphs": {
            types: "./dist/types/subgraphs/index.d.ts",
            import: "./dist/node/subgraphs/index.mjs",
          },
        },
        peerDependencies: {
          "@powerhousedao/reactor-api": "*",
          "document-model": "*",
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
          declaration: true,
          declarationDir: "./dist/types",
          emitDeclarationOnly: true,
          strict: true,
          noImplicitOverride: true,
          skipLibCheck: true,
        },
        include: ["index.ts", "subgraphs/**/*.ts"],
      }),
    );
    write("index.ts", "export {};\n");
    write(
      "powerhouse.manifest.json",
      JSON.stringify({ name: "@acme/subgraphs", subgraphs: [] }),
    );
    write(
      "subgraphs/fragments.ts",
      `import type { BaseSubgraph, SchemaBuilder } from "@powerhousedao/reactor-api";
import { ph } from "document-model";

const BillingProduct = ph.object("BillingProduct", {
  fields: { id: ph.String({ required: true }) },
});

interface HasLabel { label(): string; }
interface HasProduct { product(): { id: string }; }

export function labelFragment<T extends BaseSubgraph & HasLabel>(schema: SchemaBuilder<T>, name: string) {
  return schema.query(name, {
    returns: ph.String({ required: true }),
    resolve: ({ subgraph }) => subgraph.label(),
  });
}

export function productFragment<T extends BaseSubgraph & HasProduct>(schema: SchemaBuilder<T>, name: string) {
  return schema.query(name, {
    returns: ph.ref(BillingProduct),
    resolve: ({ subgraph }) => subgraph.product(),
  });
}
`,
    );
    write(
      "subgraphs/billing-base.ts",
      `import { BaseSubgraph } from "@powerhousedao/reactor-api";

export abstract class BillingBase extends BaseSubgraph {
  label(): string { return this.subgraphName; }
  product(): { id: string } { return { id: this.subgraphName }; }
}
`,
    );
    for (const [name, className] of [
      ["invoices", "InvoicesSubgraph"],
      ["payments", "PaymentsSubgraph"],
    ]) {
      write(
        `subgraphs/${name}/index.ts`,
        `import type { SchemaBuilder } from "@powerhousedao/reactor-api";
import { BillingBase } from "../billing-base.js";
import { labelFragment, productFragment } from "../fragments.js";

export class ${className} extends BillingBase {
  static override readonly subgraphName = "${name}";
  static override getSchema(schema: SchemaBuilder<${className}>) {
    return [
      labelFragment(schema, "${name}Label"),
      productFragment(schema, "${name}Product"),
    ];
  }
}
`,
      );
    }
    write(
      "subgraphs/index.ts",
      `export { BillingBase } from "./billing-base.js";
export { InvoicesSubgraph } from "./invoices/index.js";
export { PaymentsSubgraph } from "./payments/index.js";
`,
    );
    const messages: string[] = [];

    const result = await runBuild(buildArgs(root), {
      log: (text) => messages.push(text),
    });

    expect([result.status, result.exitCode], messages.join("")).toEqual([
      "ok",
      0,
    ]);
    expect(
      (
        JSON.parse(
          readFileSync(join(root, "dist/powerhouse.manifest.json"), "utf8"),
        ) as {
          subgraphs: { id: string }[];
        }
      ).subgraphs.map(({ id }) => id),
    ).toEqual(["invoices", "payments"]);
    for (const file of [
      "billing-base",
      "fragments",
      "invoices/index",
      "payments/index",
    ]) {
      expect(
        existsSync(join(root, "dist/types/subgraphs", `${file}.d.ts`)),
        file,
      ).toBe(true);
    }
    expect(
      messages
        .join("")
        .split("\n")
        .filter((line) => line.includes("shared subgraph base")),
    ).toEqual(["ℹ BillingBase is accepted as a shared subgraph base."]);
  }, 240_000);
});
