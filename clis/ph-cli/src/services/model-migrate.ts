import {
  createState,
  defaultBaseState,
  type DocumentModelModule,
  type DocumentModelPHState,
} from "@powerhousedao/shared/document-model";
import {
  LegacyDocumentModelModuleAdapter,
  RetirementPlanError,
  applyRetirementPlan,
  compareCodeUnits,
  createRetirementPlan,
  inferLegacyReducerBindings,
  inferLegacyUpgradeBindings,
  renderCodeFirstDocumentModelFamily,
  type RetirementPlanV1,
} from "document-model/tooling";
import { parse } from "graphql";
import { execFileSync, spawnSync } from "node:child_process";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  assertNoSymlinks,
  createRelativeSymlinkErrorFactory,
  isVisibleDirectoryBasename,
  readFileTree,
  relativePathWithin,
  sha256Digest,
  snapshotFileTree,
  toPosixPath,
  writeFileIfAbsentOrEqual,
} from "./file-tree.js";

type StoredRoot = DocumentModelPHState["global"];
type StoredDocument = {
  readonly state?: { readonly global?: StoredRoot };
} & Partial<StoredRoot>;

export type ModelMigrationReport = {
  readonly kind: "powerhouse.model-migration";
  readonly formatVersion: 1;
  readonly operation: "to-code" | "retire-legacy";
  readonly status: "ready" | "applied" | "retired" | "failed";
  readonly family: string;
  readonly packageRoot: ".";
  readonly legacyRoot: string;
  readonly candidateRoot: string;
  readonly sourceTreeDigest: `sha256:${string}` | null;
  readonly outputTreeDigest: `sha256:${string}` | null;
  readonly familyDigest: `sha256:${string}` | null;
  readonly versions: readonly number[];
  readonly modules: number;
  readonly operations: number;
  readonly errors: number;
  readonly scopes: readonly string[];
  readonly proposedWrites: readonly string[];
  readonly unmovedLegacyPaths: readonly string[];
  readonly retirementPlan?: RetirementPlanV1;
  readonly removedPaths: readonly string[];
  readonly diagnostics: readonly {
    readonly code: `PH-MIGRATE-${string}`;
    readonly severity: "error" | "warning";
    readonly path: readonly (string | number)[];
    readonly message: string;
    readonly repair: string;
  }[];
};

function recoverableGitCommit(packageRoot: string, legacyRoot: string): string {
  try {
    const commit = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const status = execFileSync(
      "git",
      [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--ignored=matching",
        "--",
        legacyRoot,
      ],
      {
        cwd: packageRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    if (!commit || status) {
      throw new RetirementPlanError(
        "PH-MIGRATE-RETIRE-NOT-RECOVERABLE",
        "Commit every legacy family file before creating or applying a retirement plan.",
      );
    }
    return commit;
  } catch (error) {
    if (error instanceof RetirementPlanError) throw error;
    throw new RetirementPlanError(
      "PH-MIGRATE-RETIRE-NOT-RECOVERABLE",
      "The legacy family must belong to a Git repository with a committed recovery revision.",
    );
  }
}

async function storedRoot(path: string): Promise<StoredRoot> {
  const stored = JSON.parse(await readFile(path, "utf8")) as StoredDocument;
  const root = stored.state?.global ?? stored;
  if (
    typeof root.id !== "string" ||
    typeof root.name !== "string" ||
    !Array.isArray(root.specifications)
  ) {
    throw new Error("PH-MIGRATE-LEGACY-JSON-INVALID");
  }
  return root as StoredRoot;
}

function normalizedLegacy(root: StoredRoot) {
  const documentModel = createState(defaultBaseState(), root);
  const version = root.specifications[0]?.version ?? 1;
  const fakeModule = {
    version,
    reducer: (document: unknown) => document,
    actions: {},
    utils: {},
    documentModel,
  } as unknown as DocumentModelModule;
  return new LegacyDocumentModelModuleAdapter({ parse }).adapt(fakeModule);
}

function relativeImport(
  fromDirectory: string,
  toDirectory: string,
): `./${string}` | `../${string}` {
  const path = toPosixPath(relative(fromDirectory, toDirectory));
  return (path.startsWith(".") ? path : `./${path}`) as
    | `./${string}`
    | `../${string}`;
}

function baseReport(request: {
  readonly operation: ModelMigrationReport["operation"];
  readonly family: string;
  readonly legacyRoot: string;
  readonly candidateRoot: string;
}): Omit<
  ModelMigrationReport,
  | "status"
  | "sourceTreeDigest"
  | "outputTreeDigest"
  | "familyDigest"
  | "versions"
  | "modules"
  | "operations"
  | "errors"
  | "scopes"
  | "proposedWrites"
  | "unmovedLegacyPaths"
  | "removedPaths"
  | "diagnostics"
> {
  return {
    kind: "powerhouse.model-migration",
    formatVersion: 1,
    operation: request.operation,
    family: request.family,
    packageRoot: ".",
    legacyRoot: request.legacyRoot,
    candidateRoot: request.candidateRoot,
  };
}

function failedReport(request: {
  readonly operation: ModelMigrationReport["operation"];
  readonly family: string;
  readonly legacyRoot: string;
  readonly candidateRoot: string;
  readonly code: `PH-MIGRATE-${string}`;
  readonly message: string;
}): ModelMigrationReport {
  return {
    ...baseReport(request),
    status: "failed",
    sourceTreeDigest: null,
    outputTreeDigest: null,
    familyDigest: null,
    versions: [],
    modules: 0,
    operations: 0,
    errors: 0,
    scopes: [],
    proposedWrites: [],
    unmovedLegacyPaths: [],
    removedPaths: [],
    diagnostics: [
      {
        code: request.code,
        severity: "error",
        path: [],
        message: request.message,
        repair:
          "Resolve the reported precondition and rerun without a force flag.",
      },
    ],
  };
}

export function modelMigrationArgumentFailure(request: {
  readonly family: string;
  readonly code: `PH-MIGRATE-${string}`;
  readonly message: string;
}): ModelMigrationReport {
  return failedReport({
    operation: "to-code",
    family: request.family,
    legacyRoot: `document-models/${request.family}`,
    candidateRoot: `document-models/.verification/${request.family}`,
    code: request.code,
    message: request.message,
  });
}

export async function runToCodeMigration(request: {
  readonly family: string;
  readonly apply: boolean;
  readonly packageRoot?: string;
}): Promise<ModelMigrationReport> {
  const packageRoot = await realpath(
    resolve(request.packageRoot ?? process.cwd()),
  );
  const legacyRoot = resolve(packageRoot, "document-models", request.family);
  const candidateRoot = resolve(
    packageRoot,
    "document-models",
    ".verification",
    request.family,
  );
  const legacyRelative = relativePathWithin(packageRoot, legacyRoot);
  const candidateRelative = relativePathWithin(packageRoot, candidateRoot);
  if (!isVisibleDirectoryBasename(request.family)) {
    return failedReport({
      operation: "to-code",
      family: request.family,
      legacyRoot: legacyRelative ?? "<outside>",
      candidateRoot: candidateRelative ?? "<outside>",
      code: "PH-MIGRATE-FAMILY-NAME-INVALID",
      message:
        "The family must be one directory name other than .verification.",
    });
  }
  if (legacyRelative === null || candidateRelative === null) {
    return failedReport({
      operation: "to-code",
      family: request.family,
      legacyRoot: String(legacyRelative),
      candidateRoot: String(candidateRelative),
      code: "PH-MIGRATE-PATH-OUTSIDE-PACKAGE",
      message: "Migration roots must stay inside the package root.",
    });
  }
  const jsonPath = resolve(legacyRoot, `${request.family}.json`);
  try {
    const sourceSymlinkError = createRelativeSymlinkErrorFactory(
      packageRoot,
      "Source path",
      (message) =>
        new RetirementPlanError("PH-MIGRATE-RETIRE-SYMLINK", message),
    );
    await assertNoSymlinks(packageRoot, legacyRoot, sourceSymlinkError);
    if (!(await lstat(legacyRoot)).isDirectory()) {
      throw new RetirementPlanError(
        "PH-MIGRATE-LEGACY-ROOT-NOT-DIRECTORY",
        `Legacy family root ${legacyRelative} is not a directory.`,
      );
    }
    const root = await storedRoot(jsonPath);
    const normalized = normalizedLegacy(root);
    const importBase = relativeImport(candidateRoot, legacyRoot);
    const source = renderCodeFirstDocumentModelFamily({
      definition: normalized.definition,
      materializedSpecifications: root.specifications,
      reducerBindings: inferLegacyReducerBindings({
        definition: normalized.definition,
        legacyImportBase: importBase,
      }),
      upgradeBindings: inferLegacyUpgradeBindings({
        definition: normalized.definition,
        legacyImportBase: importBase,
      }),
    });
    const candidatePath = resolve(candidateRoot, "code-first.ts");
    const reportPath = resolve(candidateRoot, "migration-report.json");
    const legacyTree = await snapshotFileTree(legacyRoot, sourceSymlinkError);
    const legacyFiles = legacyTree.files;
    const specifications = normalized.definition.specifications;
    const reportWithoutStatus = {
      ...baseReport({
        operation: "to-code",
        family: request.family,
        legacyRoot: legacyRelative,
        candidateRoot: candidateRelative,
      }),
      sourceTreeDigest: legacyTree.digest,
      outputTreeDigest: sha256Digest(source),
      familyDigest: normalized.digest,
      versions: specifications.map(({ version }) => version),
      modules: specifications.reduce(
        (total, specification) => total + specification.modules.length,
        0,
      ),
      operations: specifications.reduce(
        (total, specification) =>
          total +
          specification.modules.reduce(
            (moduleTotal, module) => moduleTotal + module.operations.length,
            0,
          ),
        0,
      ),
      errors: specifications.reduce(
        (total, specification) =>
          total +
          specification.modules.reduce(
            (moduleTotal, module) =>
              moduleTotal +
              module.operations.reduce(
                (operationTotal, operation) =>
                  operationTotal + operation.errors.length,
                0,
              ),
            0,
          ),
        0,
      ),
      scopes: [
        ...new Set(
          specifications.flatMap((specification) =>
            specification.modules.flatMap((module) =>
              module.operations.map(({ scope }) => scope),
            ),
          ),
        ),
      ].sort(compareCodeUnits),
      proposedWrites: [
        toPosixPath(relative(packageRoot, candidatePath)),
        toPosixPath(relative(packageRoot, reportPath)),
      ],
      unmovedLegacyPaths: legacyFiles
        .filter((path) => path !== jsonPath)
        .map((path) => toPosixPath(relative(packageRoot, path))),
      removedPaths: [] as const,
      diagnostics: [
        {
          code: "PH-MIGRATE-REDUCERS-WRAPPED" as const,
          severity: "warning" as const,
          path: ["reducers"],
          message:
            "Legacy reducer modules remain active through reduceLegacy compatibility wrappers.",
          repair:
            "Keep the legacy tree until equivalence, activation, canary, and rollback evidence pass.",
        },
      ],
    };
    const report: ModelMigrationReport = {
      ...reportWithoutStatus,
      status: request.apply ? "applied" : "ready",
    };
    if (request.apply) {
      const candidateSymlinkError = createRelativeSymlinkErrorFactory(
        packageRoot,
        "Candidate path",
        (message) =>
          new RetirementPlanError("PH-MIGRATE-CANDIDATE-SYMLINK", message),
      );
      await Promise.all([
        assertNoSymlinks(packageRoot, candidatePath, candidateSymlinkError),
        assertNoSymlinks(packageRoot, reportPath, candidateSymlinkError),
      ]);
      await mkdir(candidateRoot, { recursive: true });
      if (
        !(await writeFileIfAbsentOrEqual(
          packageRoot,
          candidatePath,
          source,
          candidateSymlinkError,
        ))
      ) {
        return failedReport({
          operation: "to-code",
          family: request.family,
          legacyRoot: legacyRelative,
          candidateRoot: candidateRelative,
          code: "PH-MIGRATE-CANDIDATE-DRIFT",
          message:
            "The verification candidate exists with different content; no file was overwritten.",
        });
      }
      if (
        !(await writeFileIfAbsentOrEqual(
          packageRoot,
          reportPath,
          `${JSON.stringify(report, null, 2)}\n`,
          candidateSymlinkError,
        ))
      ) {
        return failedReport({
          operation: "to-code",
          family: request.family,
          legacyRoot: legacyRelative,
          candidateRoot: candidateRelative,
          code: "PH-MIGRATE-REPORT-DRIFT",
          message:
            "The migration report exists with different content; no file was overwritten.",
        });
      }
    }
    return report;
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    const code = missing
      ? "PH-MIGRATE-LEGACY-NOT-FOUND"
      : error instanceof RetirementPlanError
        ? error.code
        : error instanceof Error && /^PH-MIGRATE-[A-Z0-9-]+/.test(error.message)
          ? (error.message.split(":", 1)[0] as `PH-MIGRATE-${string}`)
          : "PH-MIGRATE-CONVERSION-FAILED";
    return failedReport({
      operation: "to-code",
      family: request.family,
      legacyRoot: legacyRelative,
      candidateRoot: candidateRelative,
      code,
      message: missing
        ? `No legacy family was found at ${legacyRelative}.`
        : error instanceof Error
          ? error.message
          : String(error),
    });
  }
}

async function liveImportPaths(
  packageRoot: string,
  legacyRoot: string,
  family: string,
): Promise<string[]> {
  const ignoredDirectories = new Set([
    ".evidence",
    ".git",
    ".hg",
    ".next",
    ".ph",
    ".svn",
    ".tsbuild",
    ".turbo",
    ".verification",
    "coverage",
    "dist",
    "node_modules",
  ]);
  const verificationRoot = resolve(
    packageRoot,
    "document-models/.verification",
  );
  const candidates = await readFileTree(
    packageRoot,
    createRelativeSymlinkErrorFactory(
      packageRoot,
      "Source path",
      (message) =>
        new RetirementPlanError("PH-MIGRATE-RETIRE-SYMLINK", message),
    ),
    {
      ignoredDirectoryNames: ignoredDirectories,
      includeFile: (path) =>
        relativePathWithin(legacyRoot, path) === null &&
        relativePathWithin(verificationRoot, path) === null &&
        /\.[cm]?[jt]sx?$/.test(path),
    },
  );
  const needles = [
    `document-models/${family}`,
    `./${family}/`,
    `./${family}.js`,
    `../${family}/`,
  ];
  const matches: string[] = [];
  for (const { path, contents } of candidates) {
    const source = contents.toString("utf8");
    if (needles.some((needle) => source.includes(needle))) {
      matches.push(toPosixPath(relative(packageRoot, path)));
    }
  }
  return matches.sort(compareCodeUnits);
}

function runPackageTypecheck(packageRoot: string): boolean {
  const result = spawnSync(
    "pnpm",
    ["exec", "tsc", "--noEmit", "--pretty", "false"],
    {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: "pipe",
    },
  );
  return result.status === 0;
}

export async function runRetireLegacyMigration(request: {
  readonly family: string;
  readonly apply: boolean;
  readonly planPath?: string;
  readonly packageRoot?: string;
}): Promise<ModelMigrationReport> {
  const packageRoot = await realpath(
    resolve(request.packageRoot ?? process.cwd()),
  );
  const legacyRoot = resolve(packageRoot, "document-models", request.family);
  const candidateRoot = resolve(
    packageRoot,
    "document-models/.verification",
    request.family,
  );
  const legacyRelative =
    relativePathWithin(packageRoot, legacyRoot) ?? "<outside>";
  const candidateRelative =
    relativePathWithin(packageRoot, candidateRoot) ?? "<outside>";
  if (!isVisibleDirectoryBasename(request.family)) {
    return failedReport({
      operation: "retire-legacy",
      family: request.family,
      legacyRoot: legacyRelative,
      candidateRoot: candidateRelative,
      code: "PH-MIGRATE-FAMILY-NAME-INVALID",
      message:
        "The family must be one directory name other than .verification.",
    });
  }
  try {
    await assertNoSymlinks(
      packageRoot,
      legacyRoot,
      createRelativeSymlinkErrorFactory(
        packageRoot,
        "Source path",
        (message) =>
          new RetirementPlanError("PH-MIGRATE-RETIRE-SYMLINK", message),
      ),
    );
    if (request.apply) {
      if (!request.planPath) {
        throw new RetirementPlanError(
          "PH-MIGRATE-RETIRE-PLAN-REQUIRED",
          "--retire-legacy --apply requires --plan.",
        );
      }
      let parsedPlan: unknown;
      try {
        parsedPlan = JSON.parse(
          await readFile(resolve(packageRoot, request.planPath), "utf8"),
        ) as unknown;
      } catch {
        throw new RetirementPlanError(
          "PH-MIGRATE-RETIRE-PLAN-INVALID",
          "The retirement plan is missing or is not valid JSON.",
        );
      }
      if (
        typeof parsedPlan !== "object" ||
        parsedPlan === null ||
        (parsedPlan as { readonly kind?: unknown }).kind !==
          "powerhouse.legacy-retirement-plan" ||
        (parsedPlan as { readonly formatVersion?: unknown }).formatVersion !==
          1 ||
        typeof (parsedPlan as { readonly legacyFamilyRoot?: unknown })
          .legacyFamilyRoot !== "string"
      ) {
        throw new RetirementPlanError(
          "PH-MIGRATE-RETIRE-PLAN-INVALID",
          "The retirement plan does not have the required V1 envelope.",
        );
      }
      const plan = parsedPlan as RetirementPlanV1;
      if (plan.legacyFamilyRoot !== legacyRelative) {
        throw new RetirementPlanError(
          "PH-MIGRATE-RETIRE-PLAN-FAMILY-MISMATCH",
          "The retirement plan does not target the selected legacy family.",
        );
      }
      const imports = await liveImportPaths(
        packageRoot,
        legacyRoot,
        request.family,
      );
      if (imports.length > 0) {
        throw new RetirementPlanError(
          "PH-MIGRATE-RETIRE-LIVE-IMPORT",
          `Active sources still reference legacy targets: ${imports.join(", ")}`,
        );
      }
      const repositoryCommit = recoverableGitCommit(
        packageRoot,
        legacyRelative,
      );
      const applied = await applyRetirementPlan({
        packageRoot,
        plan,
        currentCommit: repositoryCommit,
        postStageCheck: () => runPackageTypecheck(packageRoot),
        rollbackCheck: () => runPackageTypecheck(packageRoot),
      });
      return {
        ...baseReport({
          operation: "retire-legacy",
          family: request.family,
          legacyRoot: legacyRelative,
          candidateRoot: candidateRelative,
        }),
        status: "retired",
        sourceTreeDigest: plan.sourceTreeDigest,
        outputTreeDigest: null,
        familyDigest: plan.family.digest,
        versions: [],
        modules: 0,
        operations: 0,
        errors: 0,
        scopes: [],
        proposedWrites: [],
        unmovedLegacyPaths: [],
        retirementPlan: plan,
        removedPaths: applied.removedPaths,
        diagnostics: [],
      };
    }
    const evidenceRoot = resolve(packageRoot, ".ph/migrations", request.family);
    const approved = JSON.parse(
      await readFile(resolve(evidenceRoot, "equivalence-report.json"), "utf8"),
    ) as {
      readonly family?: {
        readonly documentType?: string;
        readonly digest?: `sha256:${string}`;
      };
    };
    const familyDigest = approved.family?.digest;
    const documentType = approved.family?.documentType;
    if (!familyDigest || !documentType) {
      throw new RetirementPlanError(
        "PH-MIGRATE-RETIRE-EVIDENCE-INVALID",
        "The approved equivalence report has no family identity.",
      );
    }
    const masked = JSON.parse(
      await readFile(resolve(evidenceRoot, "masked-verification.json"), "utf8"),
    ) as { readonly status?: string };
    const imports = await liveImportPaths(
      packageRoot,
      legacyRoot,
      request.family,
    );
    const repositoryCommit = recoverableGitCommit(packageRoot, legacyRelative);
    const plan = await createRetirementPlan({
      packageRoot,
      legacyFamilyRoot: legacyRelative,
      repositoryCommit,
      documentType,
      familyDigest,
      approvedReportPath: toPosixPath(
        relative(packageRoot, resolve(evidenceRoot, "equivalence-report.json")),
      ),
      activationMarkerPath: toPosixPath(
        relative(packageRoot, resolve(evidenceRoot, "activation.json")),
      ),
      rollbackReportPath: toPosixPath(
        relative(packageRoot, resolve(evidenceRoot, "rollback.json")),
      ),
      canaryReportPath: toPosixPath(
        relative(packageRoot, resolve(evidenceRoot, "canary.json")),
      ),
      recoverableLegacyRoot: `git:${repositoryCommit}:${legacyRelative}`,
      liveImportPaths: imports,
      maskedVerificationPassed: masked.status === "pass",
    });
    return {
      ...baseReport({
        operation: "retire-legacy",
        family: request.family,
        legacyRoot: legacyRelative,
        candidateRoot: candidateRelative,
      }),
      status: "ready",
      sourceTreeDigest: plan.sourceTreeDigest,
      outputTreeDigest: null,
      familyDigest: plan.family.digest,
      versions: [],
      modules: 0,
      operations: 0,
      errors: 0,
      scopes: [],
      proposedWrites: [],
      unmovedLegacyPaths: plan.targets.map(({ path }) => path),
      retirementPlan: plan,
      removedPaths: [],
      diagnostics: [],
    };
  } catch (error) {
    return failedReport({
      operation: "retire-legacy",
      family: request.family,
      legacyRoot: legacyRelative,
      candidateRoot: candidateRelative,
      code:
        error instanceof RetirementPlanError
          ? error.code
          : "PH-MIGRATE-RETIRE-FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function modelMigrationExitCode(
  report: ModelMigrationReport,
): 0 | 1 | 2 {
  return report.status === "failed"
    ? report.diagnostics.some(
        ({ code }) =>
          code.includes("INVALID") ||
          code.includes("DRIFT") ||
          code.includes("MISMATCH"),
      )
      ? 1
      : 2
    : 0;
}

export function renderModelMigrationReport(
  report: ModelMigrationReport,
  json: boolean,
): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return;
  }
  if (report.status === "failed") {
    for (const diagnostic of report.diagnostics) {
      process.stderr.write(
        `${diagnostic.severity.toUpperCase()} ${diagnostic.code}\n${diagnostic.message}\nRepair: ${diagnostic.repair}\n`,
      );
    }
    return;
  }
  process.stdout.write(
    `${report.operation} ${report.status}: ${report.family} (${report.versions.join(", ") || "retirement"})\n`,
  );
  if (report.retirementPlan) {
    process.stdout.write(`${JSON.stringify(report.retirementPlan, null, 2)}\n`);
  }
}
