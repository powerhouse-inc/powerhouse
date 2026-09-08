import type { DefinedSubgraph } from "@powerhousedao/reactor-api";
import { print, type DocumentNode } from "graphql";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  runSubgraphToCodeMigration,
  subgraphMigrationExitCode,
  type SubgraphMigrationReport,
} from "../../../clis/ph-cli/src/services/subgraph-migrate.js";
import { ExampleSubgraph as LegacyExampleSubgraph } from "../fixtures/subgraph-migrations/v1/legacy/example/index.js";
import { UndeclaredSubgraph as LegacyUndeclaredSubgraph } from "../fixtures/subgraph-migrations/v1/legacy/undeclared/index.js";

const packageRoot = resolve(import.meta.dirname, "..");
const fixtureRoot = resolve(packageRoot, "fixtures/subgraph-migrations/v1");

type ResolverMap = Record<
  string,
  Record<string, (...args: never[]) => unknown>
>;

/**
 * The members the GraphQL host reads off a registered subgraph instance.
 * `DefinedSubgraph` is declared as `typeof BaseSubgraph`, whose instance type
 * omits the compatibility fields, so both sides are read through this shape.
 */
type SubgraphInstance = {
  readonly name: string;
  readonly typeDefs: DocumentNode;
  readonly resolvers: ResolverMap;
  readonly hasSubscriptions?: boolean;
};

type SubgraphConstructor = new (args: never) => unknown;

/** Minimal host dependencies: these tests compare declarations, not host wiring. */
function instantiate(subgraph: SubgraphConstructor): SubgraphInstance {
  const args = {
    reactorClient: {},
    relationalDb: {},
    analyticsStore: {},
    graphqlManager: {},
    syncManager: {},
    authorizationService: {},
  } as never;
  return new subgraph(args) as SubgraphInstance;
}

/**
 * The temporary package lives inside the evidence workspace so the candidate's
 * bare `@powerhousedao/reactor-api` import resolves through the same
 * node_modules the legacy class uses. A system temp directory would not.
 */
async function temporarySubgraphPackage(
  fixtures: readonly { readonly from: string; readonly as: string }[],
): Promise<{ readonly root: string; readonly cleanup: () => Promise<void> }> {
  const temporaryRoot = await mkdtemp(
    resolve(packageRoot, ".subgraph-migration-probe-"),
  );
  const root = resolve(temporaryRoot, "package");
  await mkdir(resolve(root, "subgraphs"), { recursive: true });
  for (const fixture of fixtures) {
    await cp(
      resolve(fixtureRoot, fixture.from),
      resolve(root, "subgraphs", fixture.as),
      { recursive: true },
    );
  }
  return {
    root,
    cleanup: () => rm(temporaryRoot, { recursive: true, force: true }),
  };
}

async function loadCandidate<TName extends string>(
  root: string,
  subgraph: string,
): Promise<Record<TName, DefinedSubgraph>> {
  const candidatePath = resolve(
    root,
    `subgraphs/.verification/${subgraph}/index.ts`,
  );
  return (await import(
    `${pathToFileURL(candidatePath).href}?probe=${Date.now()}`
  )) as Record<TName, DefinedSubgraph>;
}

describe("ph subgraph migrate --to-code", () => {
  let temporary: Awaited<ReturnType<typeof temporarySubgraphPackage>>;
  let reportOnly: SubgraphMigrationReport;
  let applied: SubgraphMigrationReport;
  let candidateSource: string;
  let candidateClass: DefinedSubgraph;
  let candidatePath: string;

  beforeAll(async () => {
    temporary = await temporarySubgraphPackage([
      { from: "legacy/example", as: "example" },
    ]);
    reportOnly = await runSubgraphToCodeMigration({
      subgraph: "example",
      apply: false,
      packageRoot: temporary.root,
    });
    applied = await runSubgraphToCodeMigration({
      subgraph: "example",
      apply: true,
      packageRoot: temporary.root,
    });
    candidatePath = resolve(
      temporary.root,
      "subgraphs/.verification/example/index.ts",
    );
    candidateSource = await readFile(candidatePath, "utf8");
    candidateClass = (
      await loadCandidate<"ExampleSubgraph">(temporary.root, "example")
    ).ExampleSubgraph;
  }, 30_000);

  afterAll(async () => {
    await temporary.cleanup();
  });

  it("writes nothing without --apply", () => {
    expect(reportOnly.status).toBe("ready");
    expect(subgraphMigrationExitCode(reportOnly)).toBe(0);
    expect(reportOnly.proposedWrites).toEqual([
      "subgraphs/.verification/example/index.ts",
      "subgraphs/.verification/example/migration-report.json",
    ]);
  });

  it("preserves every legacy byte", () => {
    // Conversion is additive, so the legacy tree digest must not move.
    expect(applied.sourceTreeDigest).toBe(reportOnly.sourceTreeDigest);
    expect(applied.unmovedLegacyPaths).toEqual([
      "subgraphs/example/index.ts",
      "subgraphs/example/resolvers.ts",
      "subgraphs/example/schema.ts",
    ]);
  });

  it("keeps the candidate out of every loader path", () => {
    expect(applied.candidateRoot).toBe("subgraphs/.verification/example");
    // A second top-level export would be registered first-wins by the host and
    // would silently shadow the legacy class.
    expect(
      applied.proposedWrites.every((path) => path.includes("/.verification/")),
    ).toBe(true);
  });

  it("converts to compatibility mode, never to the typed grammar", () => {
    expect(applied.schemaKind).toBe("graphql-ast-compat");
    expect(candidateClass.definition.schemaKind).toBe("graphql-ast-compat");
  });

  it("preserves the name, class export, and hasSubscriptions exactly", () => {
    const legacy = instantiate(LegacyExampleSubgraph);
    const instance = instantiate(candidateClass);
    expect(instance.name).toBe(legacy.name);
    expect(applied.className).toBe("ExampleSubgraph");
    expect(applied.hasSubscriptions).toBe(false);
    expect(instance.hasSubscriptions).toBe(legacy.hasSubscriptions);
    expect(candidateClass.definition.hasSubscriptions).toBe(false);
  });

  it("prints the identical schema, including definition and field order", () => {
    const legacy = instantiate(LegacyExampleSubgraph);
    const instance = instantiate(candidateClass);
    expect(print(instance.typeDefs)).toBe(print(legacy.typeDefs));
  });

  it("routes resolvers through the bound instance, not a copied closure", () => {
    const legacyMap = instantiate(LegacyExampleSubgraph).resolvers;
    const candidateMap = instantiate(candidateClass).resolvers;
    expect(Object.keys(candidateMap)).toEqual(Object.keys(legacyMap));
    expect(Object.keys(candidateMap.ExampleQueries!)).toEqual(
      Object.keys(legacyMap.ExampleQueries!),
    );
    const args = [undefined, { driveId: "drive-1" }] as never[];
    // `getResolvers(this)` became `getResolvers(subgraph)`, so the value the
    // resolver reads off the bound instance has to match.
    expect(candidateMap.ExampleQueries!.zebra!(...args)).toBe(
      legacyMap.ExampleQueries!.zebra!(...args),
    );
    expect(candidateMap.ExampleQueries!.zebra!(...args)).toBe(
      "example:drive-1",
    );
  });

  it("reports the dead scaffold members it drops", () => {
    expect(applied.droppedMembers).toEqual([
      "additionalContextFields",
      "onSetup",
      "onDisconnect",
    ]);
    expect(candidateSource).not.toContain("additionalContextFields");
    expect(candidateSource).not.toContain("onDisconnect");
  });

  it("warns that the legacy class is still the registered subgraph", () => {
    expect(
      applied.diagnostics.some(
        ({ code, severity }) =>
          code === "PH-MIGRATE-SUBGRAPH-LEGACY-ACTIVE" &&
          severity === "warning",
      ),
    ).toBe(true);
    expect(
      applied.diagnostics.every(({ severity }) => severity === "warning"),
    ).toBe(true);
  });

  it("is byte-identical on re-apply and refuses to overwrite a drifted candidate", async () => {
    const again = await runSubgraphToCodeMigration({
      subgraph: "example",
      apply: true,
      packageRoot: temporary.root,
    });
    expect(again.status).toBe("applied");
    expect(again.outputTreeDigest).toBe(applied.outputTreeDigest);

    const edited = `${candidateSource}\n// author edit\n`;
    await writeFile(candidatePath, edited, "utf8");
    const drifted = await runSubgraphToCodeMigration({
      subgraph: "example",
      apply: true,
      packageRoot: temporary.root,
    });
    expect(drifted.status).toBe("failed");
    expect(drifted.diagnostics[0]?.code).toBe(
      "PH-MIGRATE-SUBGRAPH-CANDIDATE-DRIFT",
    );
    expect(subgraphMigrationExitCode(drifted)).toBe(2);
    // The edit survives; a failed apply never clobbers author work.
    await expect(readFile(candidatePath, "utf8")).resolves.toBe(edited);
    await writeFile(candidatePath, candidateSource, "utf8");
  });
});

describe("ph subgraph migrate --to-code transport exposure", () => {
  let temporary: Awaited<ReturnType<typeof temporarySubgraphPackage>>;
  let report: SubgraphMigrationReport;
  let candidateSource: string;
  let candidateClass: DefinedSubgraph;

  beforeAll(async () => {
    temporary = await temporarySubgraphPackage([
      { from: "legacy/undeclared", as: "undeclared" },
    ]);
    report = await runSubgraphToCodeMigration({
      subgraph: "undeclared",
      apply: true,
      packageRoot: temporary.root,
    });
    candidateSource = await readFile(
      resolve(temporary.root, "subgraphs/.verification/undeclared/index.ts"),
      "utf8",
    );
    candidateClass = (
      await loadCandidate<"UndeclaredSubgraph">(temporary.root, "undeclared")
    ).UndeclaredSubgraph;
  }, 30_000);

  afterAll(async () => {
    await temporary.cleanup();
  });

  it("records an undeclared hasSubscriptions as undefined, not false", () => {
    expect(report.status).toBe("applied");
    expect(report.hasSubscriptions).toBe(null);
    // `false` and `undefined` select different transport setup in the host, so
    // normalizing one to the other would add or drop a WebSocket/SSE route.
    expect(candidateSource).toContain("hasSubscriptions: undefined");
    expect(candidateClass.definition.hasSubscriptions).toBe(null);
    const legacy = instantiate(LegacyUndeclaredSubgraph);
    expect(instantiate(candidateClass).hasSubscriptions).toBe(
      legacy.hasSubscriptions,
    );
    expect(legacy.hasSubscriptions).toBeUndefined();
  });

  it("imports an exported binding that lives in the legacy class module", () => {
    // A `.ts` specifier would not resolve under the repository's ESM settings.
    expect(report.typeDefsSource).toBe("document ../../undeclared/index.js");
    expect(report.resolversSource).toBe("map ../../undeclared/index.js");
    const legacy = instantiate(LegacyUndeclaredSubgraph);
    const instance = instantiate(candidateClass);
    expect(print(instance.typeDefs)).toBe(print(legacy.typeDefs));
    expect(Object.keys(instance.resolvers.Query!)).toEqual(
      Object.keys(legacy.resolvers.Query!),
    );
    expect(instance.resolvers.Query!.undeclared!()).toBe(
      legacy.resolvers.Query!.undeclared!(),
    );
  });
});

describe("ph subgraph migrate --to-code on unconvertible source", () => {
  let temporary: Awaited<ReturnType<typeof temporarySubgraphPackage>>;
  let report: SubgraphMigrationReport;

  beforeAll(async () => {
    temporary = await temporarySubgraphPackage([
      { from: "blocked/inline", as: "inline" },
    ]);
    report = await runSubgraphToCodeMigration({
      subgraph: "inline",
      apply: true,
      packageRoot: temporary.root,
    });
  }, 30_000);

  afterAll(async () => {
    await temporary.cleanup();
  });

  it("blocks instead of approximating, and writes nothing even with --apply", async () => {
    expect(report.status).toBe("blocked");
    expect(subgraphMigrationExitCode(report)).toBe(1);
    expect(report.proposedWrites).toEqual([]);
    await expect(
      readFile(
        resolve(temporary.root, "subgraphs/.verification/inline/index.ts"),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("names every blocking form in one run", () => {
    expect(
      report.diagnostics
        .filter(({ severity }) => severity === "error")
        .map(({ code }) => code)
        .sort(),
    ).toEqual([
      "PH-MIGRATE-SUBGRAPH-CONSTRUCTOR-PRESENT",
      "PH-MIGRATE-SUBGRAPH-MEMBER-UNSUPPORTED",
      "PH-MIGRATE-SUBGRAPH-ONSETUP-BODY",
      "PH-MIGRATE-SUBGRAPH-RESOLVERS-INLINE",
      "PH-MIGRATE-SUBGRAPH-TYPEDEFS-UNSUPPORTED",
    ]);
  });

  it("gives every blocker a repair", () => {
    expect(
      report.diagnostics.every(({ repair }) => repair.trim().length > 0),
    ).toBe(true);
  });
});
