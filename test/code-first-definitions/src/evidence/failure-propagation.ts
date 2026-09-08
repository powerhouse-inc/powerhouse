import {
  checkDefinitions,
  DefinitionSourceLoader,
  type DefinitionCheckReport,
  type DefinitionSourceResolution,
  type TypeScriptSourceImportInterface,
} from "document-model/tooling";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createByteManifest } from "./byte-manifest.js";
import { RecordingRegistryAdapter } from "./recording-registry-adapter.js";
import { compareCodeUnits, digestJson, equalJson } from "./utils.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ph = resolve(packageRoot, "node_modules/.bin/ph");
const fixtureRoot = resolve(
  packageRoot,
  "fixtures/reproductions/v1/failure-propagation",
);
const TYPECHECK_COMPLETED_MARKER = "✔ TypeScript build completed";

export const B9_ASSERTION_IDS = [
  "B9.exit",
  "B9.report",
  "B9.warning-policy",
  "B9.build-order",
  "B9.prepack",
  "B9.publish",
  "B9.registry-zero",
  "B9.output-unchanged",
  "B9.source-selection",
] as const;

export type B9AssertionId = (typeof B9_ASSERTION_IDS)[number];

type FailureExpected = {
  readonly status:
    | "ready"
    | "ok"
    | "invalid"
    | "failed"
    | "skipped"
    | "process-failed";
  readonly diagnosticCodes: readonly string[];
  readonly sourceOrigin: string | null;
  readonly exitCode: number;
  readonly hookOrder: readonly string[];
  readonly typecheckCompleted: boolean;
  readonly definitionCheckCompleted: boolean;
  readonly bundleWriteCount: number;
  readonly tarballWriteCount: number;
  readonly registryRequestCount: number;
  readonly decoyImportCount: number;
  readonly skipReason: string | null;
  readonly contributesReleaseEvidence: boolean;
  readonly outputUnchanged: boolean;
};

export type FailureCase = {
  readonly caseId: string;
  readonly category: string;
  readonly command: string;
  readonly config: Record<string, unknown> | null;
  readonly cliSources: readonly string[];
  readonly expected: FailureExpected;
};

export type FailurePropagationManifest = {
  readonly kind: "powerhouse.gate-fixture-manifest";
  readonly formatVersion: 1;
  readonly gate: "B9";
  readonly fixtureVersion: string;
  readonly cases: readonly FailureCase[];
};

export type FailureInjectionResult = {
  readonly injectionId: string;
  readonly command: string;
  readonly warningsAsErrors: boolean;
  readonly exitCode: number;
  readonly reportStatus: string | null;
  readonly diagnosticCodes: readonly string[];
  readonly hookOrder: readonly string[];
  readonly typecheckCompleted: boolean;
  readonly definitionCheckCompleted: boolean;
  readonly bundleWriteCount: number;
  readonly tarballWriteCount: number;
  readonly registryRequestCount: number;
  readonly sourceOrigin: string | null;
  readonly normalizedSourceKeys: readonly string[];
  readonly sourceSetDigest: `sha256:${string}` | null;
  readonly duplicateSourcePositions: readonly (readonly (string | number)[])[];
  readonly skipReason: string | null;
  readonly contributesReleaseEvidence: boolean;
  readonly decoyImportCount: number;
  readonly beforeTreeDigest: `sha256:${string}`;
  readonly afterTreeDigest: `sha256:${string}`;
};

type InternalInjectionResult = FailureInjectionResult & {
  readonly observedStatus: FailureExpected["status"];
};

export type FailureAssertionResult = {
  readonly id: B9AssertionId;
  readonly outcome: "pass" | "fail";
  readonly failures: readonly string[];
};

export type FailurePropagationEvaluation = {
  readonly injections: readonly FailureInjectionResult[];
  readonly assertions: readonly FailureAssertionResult[];
};

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function sourceKeys(
  resolution: Pick<DefinitionSourceResolution, "sourceSet">,
): string[] {
  return resolution.sourceSet.sources.map((source) =>
    JSON.stringify([source.specifier, source.exportPath ?? []]),
  );
}

function diagnosticCodes(value: string): string[] {
  return [...new Set(value.match(/PH-[A-Z0-9-]+/g) ?? [])].sort(
    compareCodeUnits,
  );
}

function commandEnvironment(): NodeJS.ProcessEnv {
  const bin = resolve(packageRoot, "node_modules/.bin");
  return {
    ...process.env,
    CI: "1",
    DO_NOT_TRACK: "1",
    PH_NO_TELEMETRY: "1",
    PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
  };
}

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  timeout = 120_000,
) {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: "utf8",
    env: commandEnvironment(),
    maxBuffer: 16 * 1024 * 1024,
    timeout,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

async function temporaryCopy(
  source: string,
  prefix: string,
  created: string[],
): Promise<string> {
  const root = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(resolve(packageRoot, `.${prefix}-`)),
  );
  created.push(root);
  await cp(source, root, { recursive: true });
  return root;
}

async function temporaryConfigProject(
  fixture: FailureCase,
  created: string[],
): Promise<string> {
  const root = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(resolve(packageRoot, ".b9-resolution-")),
  );
  created.push(root);
  await mkdir(resolve(root, "src"));
  await writeFile(
    resolve(root, "powerhouse.config.json"),
    `${JSON.stringify(fixture.config ?? {})}\n`,
  );
  await writeFile(resolve(root, "definition.ts"), "export {};\n");
  await writeFile(
    resolve(root, "src/decoy.ts"),
    "throw new Error('B9 decoy must not import');\n",
  );
  if (fixture.caseId === "source-external-symlink") {
    const external = await import("node:fs/promises").then(({ mkdtemp }) =>
      mkdtemp(resolve(packageRoot, ".b9-external-")),
    );
    created.push(external);
    await writeFile(resolve(external, "external.ts"), "export {};\n");
    await symlink(
      resolve(external, "external.ts"),
      resolve(root, "src/external.ts"),
    );
  }
  return root;
}

async function bundleManifest(root: string) {
  const dist = resolve(root, "dist");
  if (!existsSync(dist)) return [];
  return (await createByteManifest(dist)).filter(
    ({ path }) =>
      path === "style.css" ||
      path.startsWith("browser/") ||
      path.startsWith("node/"),
  );
}

function changedFileCount(
  before: readonly { readonly path: string; readonly digest: string }[],
  after: readonly { readonly path: string; readonly digest: string }[],
): number {
  const prior = new Map(before.map((entry) => [entry.path, entry.digest]));
  return after.filter((entry) => prior.get(entry.path) !== entry.digest).length;
}

function duplicatePositions(
  resolution: DefinitionSourceResolution,
): readonly (readonly (string | number)[])[] {
  return resolution.diagnostics.flatMap((diagnostic) =>
    diagnostic.code === "PH-CONFIG-DUPLICATE-SOURCE"
      ? [diagnostic.path, ...(diagnostic.related ?? []).map(({ path }) => path)]
      : [],
  );
}

function baseResult(
  fixture: FailureCase,
  overrides: Partial<InternalInjectionResult>,
): InternalInjectionResult {
  const emptyDigest = digestJson([]);
  return {
    injectionId: fixture.caseId,
    command: fixture.command,
    warningsAsErrors: fixture.caseId.endsWith("warning-as-error"),
    exitCode: 0,
    reportStatus: null,
    diagnosticCodes: [],
    hookOrder: [],
    typecheckCompleted: false,
    definitionCheckCompleted: false,
    bundleWriteCount: 0,
    tarballWriteCount: 0,
    registryRequestCount: 0,
    sourceOrigin: null,
    normalizedSourceKeys: [],
    sourceSetDigest: null,
    duplicateSourcePositions: [],
    skipReason: null,
    contributesReleaseEvidence: false,
    decoyImportCount: 0,
    beforeTreeDigest: emptyDigest,
    afterTreeDigest: emptyDigest,
    observedStatus: "ok",
    ...overrides,
  };
}

const resolutionCaseIds = new Set([
  "definition-sources-missing",
  "definition-sources-empty",
  "definition-sources-version-unsupported",
  "duplicate-canonical-source",
  "source-root-escape",
  "source-external-symlink",
  "config-only-selection",
  "cli-replaces-missing-selection",
  "cli-replaces-unsupported-selection",
  "explicit-legacy-mode",
  "decoy-source-tree-not-scanned",
]);

async function evaluateResolutionCase(
  fixture: FailureCase,
  created: string[],
): Promise<InternalInjectionResult> {
  const root = await temporaryConfigProject(fixture, created);
  let importCount = 0;
  const importer: TypeScriptSourceImportInterface = {
    importModule: () => {
      importCount += 1;
      return Promise.resolve({});
    },
  };
  const loader = new DefinitionSourceLoader(importer);
  const resolution = loader.resolve({
    configFile: resolve(root, "powerhouse.config.json"),
    cliSources: fixture.cliSources,
  });
  const checked =
    resolution.status === "skipped"
      ? await checkDefinitions({
          formatVersion: 1,
          profile: "edit",
          loadResult: { ...resolution, values: [] },
        })
      : undefined;
  const status = checked?.status ?? resolution.status;
  return baseResult(fixture, {
    exitCode: status === "failed" ? 2 : 0,
    reportStatus: status,
    diagnosticCodes: resolution.diagnostics.map(({ code }) => code),
    hookOrder:
      status === "skipped"
        ? ["config:load", "source:resolve", "definition-check:skipped"]
        : ["config:load", "source:resolve"],
    definitionCheckCompleted: status === "skipped",
    sourceOrigin: resolution.sourceSet.origin,
    normalizedSourceKeys: sourceKeys(resolution),
    sourceSetDigest: resolution.sourceSet.digest,
    duplicateSourcePositions: duplicatePositions(resolution),
    skipReason: checked?.status === "skipped" ? checked.skipReason : null,
    decoyImportCount: importCount,
    observedStatus: status,
  });
}

function parseJsonReport(stdout: string): Record<string, unknown> {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index] as string) as Record<string, unknown>;
    } catch {
      // Continue past package-manager progress lines.
    }
  }
  throw new Error("The command did not emit a JSON report.");
}

function reportSource(report: Record<string, unknown>) {
  const sourceSet = report.sourceSet as
    | {
        readonly origin?: string;
        readonly digest?: `sha256:${string}`;
        readonly sources?: readonly {
          readonly specifier: string;
          readonly exportPath?: readonly string[];
        }[];
      }
    | undefined;
  return {
    sourceOrigin: sourceSet?.origin ?? null,
    sourceSetDigest: sourceSet?.digest ?? null,
    normalizedSourceKeys: (sourceSet?.sources ?? []).map((source) =>
      JSON.stringify([source.specifier, source.exportPath ?? []]),
    ),
  };
}

async function evaluateCheckCase(
  fixture: FailureCase,
  created: string[],
): Promise<InternalInjectionResult> {
  const root = await temporaryCopy(
    resolve(fixtureRoot, "packages/control"),
    "b9-check",
    created,
  );
  const args = fixture.command
    .split(" ")
    .slice(1)
    .filter((argument) => argument !== "ph");
  const command = runCommand(ph, args, root);
  const report = parseJsonReport(command.stdout);
  const status = String(report.status) as FailureExpected["status"];
  const diagnostics = (report.diagnostics ?? []) as readonly {
    readonly code?: string;
    readonly phase?: string;
  }[];
  const source = reportSource(report);
  const importFailed = diagnostics.some(({ phase }) => phase === "import");
  const inspect = fixture.caseId === "inspect-control-source-selection";
  return baseResult(fixture, {
    exitCode: command.exitCode,
    reportStatus: status,
    diagnosticCodes: diagnostics
      .flatMap(({ code }) => (code ? [code] : []))
      .sort(compareCodeUnits),
    hookOrder: importFailed
      ? ["config:load", "source:resolve", "source:import-failed"]
      : [
          "config:load",
          "source:resolve",
          "source:import",
          `${inspect ? "definition-inspect" : "definition-check"}:${status}`,
        ],
    definitionCheckCompleted: !importFailed,
    contributesReleaseEvidence:
      fixture.caseId === "valid-control-release" && status === "ok",
    observedStatus: status,
    ...source,
  });
}

async function retainedReport(root: string): Promise<
  | {
      readonly report: DefinitionCheckReport;
      readonly contributesReleaseEvidence: boolean;
    }
  | undefined
> {
  const path = resolve(root, "dist/definition-check.release.json");
  if (!existsSync(path)) return undefined;
  return json(path);
}

function buildHooks(request: {
  readonly output: string;
  readonly retained?: Awaited<ReturnType<typeof retainedReport>>;
  readonly after: readonly { readonly path: string }[];
}): string[] {
  const hooks = ["tsc:start"];
  if (!request.output.includes(TYPECHECK_COMPLETED_MARKER)) {
    hooks.push("tsc:failed");
    return hooks;
  }
  hooks.push("tsc:ok");
  if (request.retained?.report.status === "ok") {
    hooks.push("definition-check:ok");
  } else if (request.retained?.report.status === "skipped") {
    hooks.push("definition-check:skipped");
  } else if (request.output.includes("Release definition check")) {
    hooks.push("definition-check:invalid");
    return hooks;
  }
  if (request.after.some(({ path }) => path.startsWith("browser/"))) {
    hooks.push("browser:write");
  }
  if (request.after.some(({ path }) => path.startsWith("node/"))) {
    hooks.push("node:write");
  }
  if (request.after.some(({ path }) => path === "style.css")) {
    hooks.push("tailwind:write");
  }
  if (request.retained) hooks.push("release-report:retain");
  return hooks;
}

async function evaluateBuildCase(
  fixture: FailureCase,
  created: string[],
): Promise<{ result: InternalInjectionResult; root: string }> {
  const source =
    fixture.caseId === "tsc-failure-stops-before-bundles"
      ? resolve(fixtureRoot, "packages/tsc-failure")
      : resolve(fixtureRoot, "packages/control");
  const root = await temporaryCopy(source, "b9-build", created);
  if (
    fixture.caseId === "tsc-failure-stops-before-bundles" ||
    fixture.caseId === "build-definition-invalid-stops-before-bundles"
  ) {
    await cp(resolve(fixtureRoot, "prior-output"), resolve(root, "dist"), {
      recursive: true,
    });
  }
  if (fixture.caseId === "build-explicit-legacy") {
    await writeFile(
      resolve(root, "powerhouse.config.json"),
      `${JSON.stringify(fixture.config)}\n`,
    );
  }
  const before = await bundleManifest(root);
  const args = [
    "build",
    ...fixture.cliSources.flatMap((source) => ["--source", source]),
  ];
  const command = runCommand(ph, args, root);
  const after = await bundleManifest(root);
  const retained = await retainedReport(root);
  const typecheckCompleted = command.output.includes(
    TYPECHECK_COMPLETED_MARKER,
  );
  const resolution = typecheckCompleted
    ? new DefinitionSourceLoader({
        importModule: () => Promise.resolve({}),
      }).resolve({
        configFile: resolve(root, "powerhouse.config.json"),
        cliSources: fixture.cliSources,
      })
    : undefined;
  const status: FailureExpected["status"] =
    command.exitCode !== 0
      ? "process-failed"
      : retained?.report.status === "skipped"
        ? "skipped"
        : "ok";
  return {
    root,
    result: baseResult(fixture, {
      exitCode: command.exitCode,
      reportStatus:
        retained?.report.status ??
        (command.output.includes("Release definition check")
          ? "invalid"
          : null),
      diagnosticCodes: diagnosticCodes(command.output),
      hookOrder: buildHooks({ output: command.output, retained, after }),
      typecheckCompleted,
      definitionCheckCompleted:
        retained !== undefined ||
        command.output.includes("Release definition check"),
      bundleWriteCount: changedFileCount(before, after),
      sourceOrigin: resolution?.sourceSet.origin ?? null,
      normalizedSourceKeys: resolution ? sourceKeys(resolution) : [],
      sourceSetDigest: resolution?.sourceSet.digest ?? null,
      skipReason:
        retained?.report.status === "skipped"
          ? retained.report.skipReason
          : null,
      contributesReleaseEvidence: retained?.contributesReleaseEvidence === true,
      beforeTreeDigest: digestJson(before),
      afterTreeDigest: digestJson(after),
      observedStatus: status,
    }),
  };
}

async function tarballCount(root: string): Promise<number> {
  return (await readdir(root)).filter((name) => name.endsWith(".tgz")).length;
}

async function copyBuiltControl(
  builtRoot: string,
  created: string[],
): Promise<string> {
  const root = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(resolve(packageRoot, ".b9-package-")),
  );
  created.push(root);
  await cp(builtRoot, root, { recursive: true, dereference: false });
  return root;
}

async function evaluatePackageCase(
  fixture: FailureCase,
  created: string[],
  builtRoot: string,
): Promise<InternalInjectionResult> {
  const retainedCase = fixture.caseId.includes("retained");
  const root = retainedCase
    ? await copyBuiltControl(builtRoot, created)
    : await temporaryCopy(
        resolve(fixtureRoot, "packages/control"),
        "b9-package",
        created,
      );
  const before = await bundleManifest(root);
  const beforeTarballs = await tarballCount(root);
  const registry = new RecordingRegistryAdapter();
  let command: ReturnType<typeof runCommand>;
  if (fixture.caseId.startsWith("npm-prepack")) {
    command = runCommand("npm", ["pack", "--dry-run", "--json"], root);
  } else if (fixture.caseId.startsWith("pnpm-prepack")) {
    command = runCommand("pnpm", ["pack"], root);
  } else if (fixture.caseId === "npm-publish-dry-run-retained") {
    command = runCommand("npm", ["publish", "--dry-run", "--json"], root);
  } else {
    command = runCommand(ph, ["publish"], root);
  }
  const after = await bundleManifest(root);
  const afterTarballs = await tarballCount(root);
  const retained = await retainedReport(root);
  const resolution = new DefinitionSourceLoader({
    importModule: () => Promise.resolve({}),
  }).resolve({ configFile: resolve(root, "powerhouse.config.json") });
  const missing = command.exitCode !== 0;
  const prepack = fixture.category === "prepack";
  const publish = fixture.category === "publication";
  const hooks = publish
    ? missing
      ? ["publish:preflight", "retained-report:missing"]
      : ["prepack", "retained-report:ok", "publish:dry-run"]
    : prepack
      ? missing
        ? ["prepack", "retained-report:missing"]
        : [
            "prepack",
            "retained-report:ok",
            ...(afterTarballs > beforeTarballs ? ["tarball:write"] : []),
          ]
      : [];
  return baseResult(fixture, {
    exitCode: command.exitCode,
    reportStatus: missing ? "failed" : (retained?.report.status ?? "ok"),
    diagnosticCodes: diagnosticCodes(command.output),
    hookOrder: hooks,
    definitionCheckCompleted: true,
    tarballWriteCount: afterTarballs - beforeTarballs,
    registryRequestCount: registry.requestCount,
    sourceOrigin: resolution.sourceSet.origin,
    normalizedSourceKeys: sourceKeys(resolution),
    sourceSetDigest: resolution.sourceSet.digest,
    contributesReleaseEvidence:
      !missing && retained?.contributesReleaseEvidence === true,
    beforeTreeDigest: digestJson(before),
    afterTreeDigest: digestJson(after),
    observedStatus: missing ? "process-failed" : "ok",
  });
}

function compareExpected(
  fixture: FailureCase,
  result: InternalInjectionResult,
): string[] {
  const failures: string[] = [];
  const fields = [
    "exitCode",
    "hookOrder",
    "typecheckCompleted",
    "definitionCheckCompleted",
    "bundleWriteCount",
    "tarballWriteCount",
    "registryRequestCount",
    "sourceOrigin",
    "decoyImportCount",
    "skipReason",
    "contributesReleaseEvidence",
  ] as const;
  if (result.observedStatus !== fixture.expected.status) {
    failures.push(
      `${fixture.caseId}.status expected ${fixture.expected.status}, received ${result.observedStatus}`,
    );
  }
  if (!equalJson(result.diagnosticCodes, fixture.expected.diagnosticCodes)) {
    failures.push(`${fixture.caseId}.diagnosticCodes`);
  }
  for (const field of fields) {
    if (!equalJson(result[field], fixture.expected[field])) {
      failures.push(
        `${fixture.caseId}.${field} expected ${JSON.stringify(
          fixture.expected[field],
        )}, received ${JSON.stringify(result[field])}`,
      );
    }
  }
  const unchanged = result.beforeTreeDigest === result.afterTreeDigest;
  if (unchanged !== fixture.expected.outputUnchanged) {
    failures.push(`${fixture.caseId}.outputUnchanged`);
  }
  return failures;
}

function assertionFailures(
  manifest: FailurePropagationManifest,
  results: readonly InternalInjectionResult[],
) {
  const byId = new Map(results.map((result) => [result.injectionId, result]));
  const comparisons = new Map(
    manifest.cases.map((fixture) => {
      const result = byId.get(fixture.caseId);
      return [
        fixture.caseId,
        result
          ? compareExpected(fixture, result)
          : [`${fixture.caseId}: result missing`],
      ];
    }),
  );
  const categories: Record<B9AssertionId, (fixture: FailureCase) => boolean> = {
    "B9.exit": () => true,
    "B9.report": (fixture) =>
      !["typecheck", "build", "prepack", "publication"].includes(
        fixture.category,
      ),
    "B9.warning-policy": (fixture) => fixture.category === "warning",
    "B9.build-order": (fixture) =>
      fixture.category === "typecheck" || fixture.category === "build",
    "B9.prepack": (fixture) => fixture.category === "prepack",
    "B9.publish": (fixture) => fixture.category === "publication",
    "B9.registry-zero": () => true,
    "B9.output-unchanged": () => true,
    "B9.source-selection": (fixture) =>
      ["configuration", "source-selection"].includes(fixture.category) ||
      fixture.caseId.includes("control") ||
      fixture.caseId.includes("retained"),
  };
  const output = new Map<B9AssertionId, string[]>(
    B9_ASSERTION_IDS.map((id) => [id, []]),
  );
  for (const id of B9_ASSERTION_IDS) {
    for (const fixture of manifest.cases.filter(categories[id])) {
      output.get(id)?.push(...(comparisons.get(fixture.caseId) ?? []));
    }
  }
  const stableCases = [
    "valid-control-edit",
    "valid-control-release",
    "build-control",
    "npm-prepack-retained",
    "pnpm-prepack-retained",
    "npm-publish-dry-run-retained",
    "inspect-control-source-selection",
  ];
  const digests = stableCases.map((id) => byId.get(id)?.sourceSetDigest);
  if (
    digests.some((digest) => digest === null || digest === undefined) ||
    new Set(digests).size !== 1
  ) {
    output
      .get("B9.source-selection")
      ?.push("control source-set digest changed across lifecycle commands");
  }
  return output;
}

export async function readFailurePropagationManifest(
  path = resolve(fixtureRoot, "manifest.json"),
): Promise<FailurePropagationManifest> {
  return json(path);
}

export async function evaluateFailurePropagation(
  manifestPath = resolve(fixtureRoot, "manifest.json"),
): Promise<FailurePropagationEvaluation> {
  const manifest = await readFailurePropagationManifest(manifestPath);
  const created: string[] = [];
  const results: InternalInjectionResult[] = [];
  let builtRoot: string | undefined;
  try {
    for (const fixture of manifest.cases) {
      if (resolutionCaseIds.has(fixture.caseId)) {
        results.push(await evaluateResolutionCase(fixture, created));
      } else if (
        fixture.category === "definition" ||
        fixture.category === "import" ||
        fixture.category === "warning" ||
        fixture.caseId === "inspect-control-source-selection"
      ) {
        results.push(await evaluateCheckCase(fixture, created));
      } else if (
        fixture.category === "typecheck" ||
        fixture.category === "build"
      ) {
        const evaluated = await evaluateBuildCase(fixture, created);
        results.push(evaluated.result);
        if (fixture.caseId === "build-control") builtRoot = evaluated.root;
      } else if (
        fixture.category === "prepack" ||
        fixture.category === "publication"
      ) {
        if (!builtRoot) {
          throw new Error("B9 package cases require the build control first.");
        }
        results.push(await evaluatePackageCase(fixture, created, builtRoot));
      }
    }

    const failures = assertionFailures(manifest, results);
    return {
      injections: results.map(
        ({ observedStatus: _observedStatus, ...result }) => result,
      ),
      assertions: B9_ASSERTION_IDS.map((id) => ({
        id,
        outcome: failures.get(id)?.length === 0 ? "pass" : "fail",
        failures: failures.get(id) ?? [],
      })),
    };
  } finally {
    await Promise.all(
      created.map((path) => rm(path, { recursive: true, force: true })),
    );
  }
}
