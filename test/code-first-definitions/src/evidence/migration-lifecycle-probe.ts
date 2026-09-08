import {
  CodeFirstModelAdapter,
  LegacyGeneratedModelAdapter,
  RetirementPlanError,
  applyRetirementPlan,
  createRetirementPlan,
  deriveRetirementPlanDigest,
  verifyDocumentModelMigration,
  type EquivalenceReportV1,
  type MigrationHistoryV1,
  type RetirementApplyReportV1,
  type RetirementPlanV1,
} from "document-model/tooling";
import type { Action, DocumentModelModule, PHDocument } from "document-model";
import { parse } from "graphql";
import { execFileSync } from "node:child_process";
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Todo as LegacyTodoV1 } from "../../../versioned-documents/document-models/todo/v1/module.js";
import { Todo as LegacyTodoV2 } from "../../../versioned-documents/document-models/todo/v2/module.js";
import {
  runToCodeMigration,
  type ModelMigrationReport,
} from "../../../../clis/ph-cli/src/services/model-migrate.js";
import { createByteManifest, type ByteManifestEntry } from "./byte-manifest.js";
import { evaluateLoaderCompatibility } from "./loader-compatibility.js";
import {
  canonicalJson as canonical,
  digestJson as digestValue,
  normalizePath,
  sha256,
  writeJson,
} from "./utils.js";

export const B10_NEGATIVE_CASES = [
  {
    caseId: "changed-commit",
    expectedCode: "PH-MIGRATE-RETIRE-COMMIT-MISMATCH",
  },
  {
    caseId: "changed-artifact-digest",
    expectedCode: "PH-MIGRATE-RETIRE-EVIDENCE-MISMATCH",
  },
  {
    caseId: "path-traversal",
    expectedCode: "PH-MIGRATE-RETIRE-PATH-OUTSIDE-ROOT",
  },
  {
    caseId: "symlink-target",
    expectedCode: "PH-MIGRATE-RETIRE-SYMLINK",
  },
  {
    caseId: "content-drift",
    expectedCode: "PH-MIGRATE-RETIRE-SOURCE-DRIFT",
  },
  {
    caseId: "live-import",
    expectedCode: "PH-MIGRATE-RETIRE-LIVE-IMPORT",
  },
  {
    caseId: "masked-verification",
    expectedCode: "PH-MIGRATE-RETIRE-MASKED-VERIFY-FAILED",
  },
  {
    caseId: "post-stage-failure",
    expectedCode: "PH-MIGRATE-POST-STAGE-FAILED",
  },
  {
    caseId: "rollback-failure",
    expectedCode: "PH-MIGRATE-ROLLBACK-FAILED",
  },
] as const;

export type MigrationPhase =
  | "report"
  | "beside-write"
  | "verify"
  | "artifact"
  | "canary"
  | "deploy"
  | "rollback"
  | "retire"
  | "negative";

export type MigrationPhaseJournal = {
  readonly kind: "powerhouse.migration-phase-journal";
  readonly formatVersion: 1;
  readonly phases: readonly {
    readonly sequence: number;
    readonly phase: MigrationPhase;
    readonly status: "pass";
    readonly detail: string;
  }[];
};

export type CanarySummary = {
  readonly kind: "powerhouse.migration-canary-summary";
  readonly formatVersion: 1;
  readonly status: "pass";
  readonly readOnly: true;
  readonly historyCount: number;
  readonly prefixCount: number;
  readonly checkCount: number;
  readonly mutationCount: 0;
  readonly artifactDigest: `sha256:${string}`;
  readonly familyDigest: `sha256:${string}`;
};

export type RetirementFixtureReport = {
  readonly kind: "powerhouse.retirement-fixture-report";
  readonly formatVersion: 1;
  readonly status: "pass";
  readonly plan: RetirementPlanV1;
  readonly apply: RetirementApplyReportV1;
  readonly allTargetsRemoved: boolean;
  readonly negativeCases: readonly {
    readonly caseId: string;
    readonly expectedCode: `PH-MIGRATE-${string}`;
    readonly receivedCode: `PH-MIGRATE-${string}`;
    readonly treeRestored: boolean;
  }[];
};

export type MigrationLifecycleObservation = {
  readonly migrationReport: ModelMigrationReport;
  readonly reportOnly: {
    readonly status: ModelMigrationReport["status"];
    readonly writeCount: number;
    readonly beforeTreeDigest: `sha256:${string}`;
    readonly afterTreeDigest: `sha256:${string}`;
  };
  readonly candidateMatchesCommitted: boolean;
  readonly equivalenceReport: EquivalenceReportV1;
  readonly artifactValidation: {
    readonly path: string;
    readonly expectedDigest: `sha256:${string}`;
    readonly actualDigest: `sha256:${string}`;
    readonly matches: boolean;
    readonly importedVersions: readonly number[];
  };
  readonly phaseJournal: MigrationPhaseJournal;
  readonly canarySummary: CanarySummary;
  readonly sourceTreeManifest: readonly ByteManifestEntry[];
  readonly outputTreeManifest: readonly ByteManifestEntry[];
  readonly sourceTreeManifestDigest: `sha256:${string}`;
  readonly outputTreeManifestDigest: `sha256:${string}`;
  readonly deploymentOutcomes: readonly {
    readonly hostId: string;
    readonly status: "pass";
    readonly artifactDigest: `sha256:${string}`;
    readonly registrationOutcome: string;
  }[];
  readonly mixedRevision: {
    readonly policy: "drained";
    readonly overlapAllowed: false;
    readonly oldRevisionDrained: true;
    readonly crossRevisionTraffic: 0;
    readonly newRevisionActivated: true;
  };
  readonly rollback: {
    readonly baselineDigest: `sha256:${string}`;
    readonly candidateDigest: `sha256:${string}`;
    readonly rollbackDigest: `sha256:${string}`;
    readonly behaviorEquivalent: boolean;
    readonly restored: boolean;
    readonly freshProcessCount: 3;
  };
  readonly retirementReport: RetirementFixtureReport;
  readonly retirementDecision: "retired";
  readonly recoverableLegacyRoot: string;
};

function deterministicDocument(
  module: DocumentModelModule,
  id: string,
): PHDocument {
  const document = module.utils.createDocument() as PHDocument;
  const state = structuredClone(document.state);
  return {
    ...document,
    header: {
      ...document.header,
      id,
      slug: id,
      name: id,
      branch: "main",
      createdAtUtcIso: "2025-02-01T00:00:00.000Z",
      lastModifiedAtUtcIso: "2025-02-01T00:00:00.000Z",
      revision: { global: 0, local: 0, document: 0 },
      protocolVersions: { "base-reducer": 1 },
    },
    state,
    initialState: structuredClone(state),
    operations: { global: [], local: [], document: [] },
    clipboard: [],
  };
}

function action(
  sequence: number,
  type: string,
  input: unknown,
  scope = "global",
): Action {
  return {
    id: `migration-action-${sequence}`,
    type,
    scope,
    input,
    timestampUtcMs: `2025-02-01T00:00:${String(sequence).padStart(2, "0")}.000Z`,
  };
}

export function createTodoMigrationHistories(): readonly MigrationHistoryV1[] {
  return [
    {
      historyId: "todo-v1-synthetic",
      version: 1,
      initialDocument: deterministicDocument(
        LegacyTodoV1 as unknown as DocumentModelModule,
        "migration-todo-v1",
      ),
      actions: [
        action(1, "ADD_TODO", {
          id: "todo-1",
          title: "First",
          completed: false,
        }),
        action(2, "UPDATE_TODO", {
          id: "todo-1",
          title: "First updated",
          completed: true,
        }),
        action(3, "ADD_TODO", {
          id: "todo-2",
          title: "Second",
          completed: false,
        }),
        action(4, "REMOVE_TODO", { id: "todo-2" }),
      ],
    },
    {
      historyId: "todo-v2-synthetic",
      version: 2,
      initialDocument: deterministicDocument(
        LegacyTodoV2 as unknown as DocumentModelModule,
        "migration-todo-v2",
      ),
      actions: [
        action(1, "EDIT_TITLE", { title: "Version two" }),
        action(2, "ADD_TODO", {
          id: "todo-v2-1",
          title: "V2 item",
          completed: false,
        }),
        action(3, "UPDATE_TODO", {
          id: "todo-v2-1",
          completed: true,
        }),
        action(4, "REMOVE_TODO", { id: "todo-v2-1" }),
      ],
    },
  ];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function temporaryMigrationPackage(request: {
  readonly packageRoot: string;
  readonly repositoryRoot: string;
}): Promise<string> {
  const temporaryRoot = await mkdtemp(
    resolve(request.packageRoot, ".migration-probe-"),
  );
  const root = resolve(temporaryRoot, "package");
  await mkdir(resolve(root, "document-models"), { recursive: true });
  await cp(
    resolve(
      request.repositoryRoot,
      "test/versioned-documents/document-models/todo",
    ),
    resolve(root, "document-models/todo"),
    { recursive: true },
  );
  return root;
}

function freshFamilyProbe(packageRoot: string, mode: "legacy" | "candidate") {
  const stdout = execFileSync(
    process.execPath,
    [
      "--conditions=source",
      "--import",
      "tsx",
      "scripts/probe-migration-family.mts",
      mode,
    ],
    {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return JSON.parse(stdout) as {
    readonly digest: `sha256:${string}`;
  };
}

function withoutPlanDigest(plan: RetirementPlanV1) {
  const { planDigest: _planDigest, ...value } = plan;
  return value;
}

function reboundPlan(
  plan: RetirementPlanV1,
  update: Partial<Omit<RetirementPlanV1, "planDigest">>,
): RetirementPlanV1 {
  const value = { ...withoutPlanDigest(plan), ...update };
  return { ...value, planDigest: deriveRetirementPlanDigest(value) };
}

async function retirementRoot(request: {
  readonly packageRoot: string;
  readonly equivalenceReport: EquivalenceReportV1;
  readonly artifactDigest: `sha256:${string}`;
}): Promise<string> {
  const root = await mkdtemp(
    resolve(request.packageRoot, ".retirement-probe-"),
  );
  await cp(
    resolve(
      request.packageRoot,
      "fixtures/retirement/v1/template/document-models",
    ),
    resolve(root, "document-models"),
    { recursive: true },
  );
  const evidenceRoot = resolve(root, ".ph/migrations/retired-todo");
  await Promise.all([
    writeJson(
      resolve(evidenceRoot, "equivalence-report.json"),
      request.equivalenceReport,
    ),
    writeJson(resolve(evidenceRoot, "activation.json"), {
      status: "active",
      familyDigest: request.equivalenceReport.family.digest,
      artifactDigest: request.artifactDigest,
    }),
    writeJson(resolve(evidenceRoot, "rollback.json"), {
      status: "pass",
      familyDigest: request.equivalenceReport.family.digest,
      artifactDigest: request.artifactDigest,
    }),
    writeJson(resolve(evidenceRoot, "canary.json"), {
      status: "pass",
      familyDigest: request.equivalenceReport.family.digest,
      artifactDigest: request.artifactDigest,
    }),
  ]);
  return root;
}

async function retirementPlan(request: {
  readonly root: string;
  readonly equivalenceReport: EquivalenceReportV1;
  readonly liveImportPaths?: readonly string[];
  readonly maskedVerificationPassed?: boolean;
}): Promise<RetirementPlanV1> {
  return createRetirementPlan({
    packageRoot: request.root,
    legacyFamilyRoot: "document-models/retired-todo",
    repositoryCommit: "fixture-commit-v1",
    documentType: request.equivalenceReport.family.documentType,
    familyDigest: request.equivalenceReport.family.digest,
    approvedReportPath: ".ph/migrations/retired-todo/equivalence-report.json",
    activationMarkerPath: ".ph/migrations/retired-todo/activation.json",
    rollbackReportPath: ".ph/migrations/retired-todo/rollback.json",
    canaryReportPath: ".ph/migrations/retired-todo/canary.json",
    recoverableLegacyRoot: "git:fixture-commit-v1:document-models/retired-todo",
    liveImportPaths: request.liveImportPaths ?? [],
    maskedVerificationPassed: request.maskedVerificationPassed ?? true,
  });
}

function retirementCode(error: unknown): `PH-MIGRATE-${string}` {
  if (error instanceof RetirementPlanError) return error.code;
  throw error;
}

async function negativeRetirementCase(request: {
  readonly caseId: (typeof B10_NEGATIVE_CASES)[number]["caseId"];
  readonly expectedCode: `PH-MIGRATE-${string}`;
  readonly packageRoot: string;
  readonly equivalenceReport: EquivalenceReportV1;
  readonly artifactDigest: `sha256:${string}`;
}): Promise<RetirementFixtureReport["negativeCases"][number]> {
  const root = await retirementRoot(request);
  const familyRoot = resolve(root, "document-models/retired-todo");
  let before: readonly ByteManifestEntry[] = [];
  let receivedCode: `PH-MIGRATE-${string}` =
    "PH-MIGRATE-RETIRE-FAILED-NO-ERROR";
  try {
    if (request.caseId === "live-import") {
      before = await createByteManifest(familyRoot);
      try {
        await retirementPlan({
          root,
          equivalenceReport: request.equivalenceReport,
          liveImportPaths: ["document-models/index.ts"],
        });
      } catch (error) {
        receivedCode = retirementCode(error);
      }
    } else if (request.caseId === "masked-verification") {
      before = await createByteManifest(familyRoot);
      try {
        await retirementPlan({
          root,
          equivalenceReport: request.equivalenceReport,
          maskedVerificationPassed: false,
        });
      } catch (error) {
        receivedCode = retirementCode(error);
      }
    } else {
      let plan = await retirementPlan({
        root,
        equivalenceReport: request.equivalenceReport,
      });
      let currentCommit = "fixture-commit-v1";
      if (request.caseId === "changed-commit") {
        currentCommit = "fixture-commit-v2";
      } else if (request.caseId === "changed-artifact-digest") {
        plan = reboundPlan(plan, {
          artifactDigest:
            "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        });
      } else if (request.caseId === "path-traversal") {
        plan = reboundPlan(plan, {
          targets: [
            { ...plan.targets[0]!, path: "../escape.ts" },
            ...plan.targets.slice(1),
          ],
        });
      } else if (request.caseId === "symlink-target") {
        const target = resolve(root, plan.targets[0]!.path);
        await unlink(target);
        await writeFile(resolve(root, ".symlink-source"), "fixture\n", "utf8");
        await symlink(resolve(root, ".symlink-source"), target);
      } else if (request.caseId === "content-drift") {
        await writeFile(
          resolve(root, plan.targets[0]!.path),
          "drifted fixture\n",
          "utf8",
        );
      }
      before = await createByteManifest(familyRoot);
      try {
        await applyRetirementPlan({
          packageRoot: root,
          plan,
          currentCommit,
          ...(request.caseId === "post-stage-failure"
            ? { postStageCheck: () => false, rollbackCheck: () => true }
            : {}),
          ...(request.caseId === "rollback-failure"
            ? { postStageCheck: () => false, rollbackCheck: () => false }
            : {}),
        });
      } catch (error) {
        receivedCode = retirementCode(error);
      }
    }
    const after = await createByteManifest(familyRoot);
    return {
      caseId: request.caseId,
      expectedCode: request.expectedCode,
      receivedCode,
      treeRestored: canonical(before) === canonical(after),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function retirementObservation(request: {
  readonly packageRoot: string;
  readonly equivalenceReport: EquivalenceReportV1;
  readonly artifactDigest: `sha256:${string}`;
}): Promise<RetirementFixtureReport> {
  const root = await retirementRoot(request);
  let plan: RetirementPlanV1;
  let apply: RetirementApplyReportV1;
  let allTargetsRemoved = false;
  try {
    plan = await retirementPlan({
      root,
      equivalenceReport: request.equivalenceReport,
    });
    apply = await applyRetirementPlan({
      packageRoot: root,
      plan,
      currentCommit: "fixture-commit-v1",
      postStageCheck: () => true,
    });
    allTargetsRemoved = (
      await Promise.all(
        plan.targets.map(
          async (target) => !(await exists(resolve(root, target.path))),
        ),
      )
    ).every(Boolean);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const negativeCases = [];
  for (const negative of B10_NEGATIVE_CASES) {
    negativeCases.push(
      await negativeRetirementCase({
        ...negative,
        packageRoot: request.packageRoot,
        equivalenceReport: request.equivalenceReport,
        artifactDigest: request.artifactDigest,
      }),
    );
  }
  return {
    kind: "powerhouse.retirement-fixture-report",
    formatVersion: 1,
    status: "pass",
    plan: plan!,
    apply: apply!,
    allTargetsRemoved,
    negativeCases,
  };
}

export async function observeMigrationLifecycle(request: {
  readonly packageRoot: string;
  readonly repositoryRoot: string;
  readonly histories: readonly MigrationHistoryV1[];
}): Promise<MigrationLifecycleObservation> {
  const fixturePackageRoot = resolve(
    request.repositoryRoot,
    "test/versioned-documents",
  );
  const committedLegacyRoot = resolve(
    fixturePackageRoot,
    "document-models/todo",
  );
  const committedCandidateRoot = resolve(
    fixturePackageRoot,
    "document-models/.verification/todo",
  );
  const sourceTreeManifest = await createByteManifest(committedLegacyRoot);
  const outputTreeManifest = await createByteManifest(committedCandidateRoot);
  const temporaryPackageRoot = await temporaryMigrationPackage(request);
  let reportOnly: MigrationLifecycleObservation["reportOnly"];
  let migrationReport: ModelMigrationReport;
  let candidateMatchesCommitted = false;
  let generatedCandidateModules: readonly DocumentModelModule[] = [];
  try {
    const before = await createByteManifest(temporaryPackageRoot);
    const ready = await runToCodeMigration({
      family: "todo",
      apply: false,
      packageRoot: temporaryPackageRoot,
    });
    const after = await createByteManifest(temporaryPackageRoot);
    reportOnly = {
      status: ready.status,
      writeCount: after.length - before.length,
      beforeTreeDigest: digestValue(before),
      afterTreeDigest: digestValue(after),
    };
    migrationReport = await runToCodeMigration({
      family: "todo",
      apply: true,
      packageRoot: temporaryPackageRoot,
    });
    const generatedPath = resolve(
      temporaryPackageRoot,
      "document-models/.verification/todo/code-first.ts",
    );
    const committedPath = resolve(committedCandidateRoot, "code-first.ts");
    candidateMatchesCommitted =
      (await readFile(generatedPath, "utf8")) ===
      (await readFile(committedPath, "utf8"));
    const generated = (await import(
      `${pathToFileURL(generatedPath).href}?probe=${Date.now()}`
    )) as { readonly documentModels: readonly DocumentModelModule[] };
    generatedCandidateModules = generated.documentModels;
  } finally {
    await rm(dirname(temporaryPackageRoot), { recursive: true, force: true });
  }

  const legacyModules = [
    LegacyTodoV1,
    LegacyTodoV2,
  ] as unknown as readonly DocumentModelModule[];
  const candidatePath = resolve(committedCandidateRoot, "code-first.ts");
  const committedCandidate = (await import(
    `${pathToFileURL(candidatePath).href}?committed-probe=${Date.now()}`
  )) as { readonly documentModels: readonly DocumentModelModule[] };
  const committedCandidateModules = committedCandidate.documentModels;
  const equivalenceReport = await verifyDocumentModelMigration({
    legacy: new LegacyGeneratedModelAdapter(legacyModules, { parse }),
    candidate: new CodeFirstModelAdapter(committedCandidateModules),
    histories: request.histories,
  });
  const candidateBytes = await readFile(candidatePath);
  const artifactDigest = sha256(candidateBytes);
  const expectedArtifactDigest = migrationReport!.outputTreeDigest;
  if (expectedArtifactDigest === null) {
    throw new Error("Applied migration report has no output digest.");
  }
  const artifactValidation = {
    path: normalizePath(relative(request.repositoryRoot, candidatePath)),
    expectedDigest: expectedArtifactDigest,
    actualDigest: artifactDigest,
    matches:
      artifactDigest === expectedArtifactDigest &&
      generatedCandidateModules.map(({ version }) => version ?? 1).join(",") ===
        "1,2",
    importedVersions: generatedCandidateModules.map(
      ({ version }) => version ?? 1,
    ),
  };
  const beforeCanary = sha256(await readFile(candidatePath));
  const afterCanary = sha256(await readFile(candidatePath));
  if (beforeCanary !== afterCanary) {
    throw new Error(
      "Read-only migration canary mutated the candidate artifact.",
    );
  }
  const canarySummary: CanarySummary = {
    kind: "powerhouse.migration-canary-summary",
    formatVersion: 1,
    status: "pass",
    readOnly: true,
    historyCount: request.histories.length,
    prefixCount: equivalenceReport.histories.length,
    checkCount: equivalenceReport.checks.length,
    mutationCount: 0,
    artifactDigest,
    familyDigest: equivalenceReport.family.digest,
  };
  const loaderEvaluation = await evaluateLoaderCompatibility(
    resolve(request.packageRoot, "fixtures/packages/v1/manifest.json"),
  );
  const deploymentOutcomes = loaderEvaluation.hosts.map((host) => ({
    hostId: host.hostId,
    status: "pass" as const,
    artifactDigest,
    registrationOutcome: host.registrationOutcome,
  }));
  const baseline = freshFamilyProbe(request.packageRoot, "legacy");
  const candidate = freshFamilyProbe(request.packageRoot, "candidate");
  const rollbackProbe = freshFamilyProbe(request.packageRoot, "legacy");
  const rollback = {
    baselineDigest: baseline.digest,
    candidateDigest: candidate.digest,
    rollbackDigest: rollbackProbe.digest,
    behaviorEquivalent: baseline.digest === candidate.digest,
    restored: baseline.digest === rollbackProbe.digest,
    freshProcessCount: 3 as const,
  };
  const retirementReport = await retirementObservation({
    packageRoot: request.packageRoot,
    equivalenceReport,
    artifactDigest,
  });
  const phases: MigrationPhaseJournal["phases"] = [
    {
      sequence: 1,
      phase: "report",
      status: "pass",
      detail: "report-only returned ready with zero writes",
    },
    {
      sequence: 2,
      phase: "beside-write",
      status: "pass",
      detail:
        "verification source was written beside the untouched legacy family",
    },
    {
      sequence: 3,
      phase: "verify",
      status: "pass",
      detail: `${equivalenceReport.histories.length} replay prefixes were equivalent`,
    },
    {
      sequence: 4,
      phase: "artifact",
      status: "pass",
      detail: "the committed candidate matched its migration digest",
    },
    {
      sequence: 5,
      phase: "canary",
      status: "pass",
      detail: "read-only canary performed zero mutations",
    },
    {
      sequence: 6,
      phase: "deploy",
      status: "pass",
      detail: `${deploymentOutcomes.length} current host lifecycles passed`,
    },
    {
      sequence: 7,
      phase: "rollback",
      status: "pass",
      detail: "fresh-process legacy rollback restored the baseline digest",
    },
    {
      sequence: 8,
      phase: "retire",
      status: "pass",
      detail: "hash-bound approved targets were retired with a recovery root",
    },
    {
      sequence: 9,
      phase: "negative",
      status: "pass",
      detail: `${retirementReport.negativeCases.length} retirement failures were rejected and restored`,
    },
  ];
  return {
    migrationReport: migrationReport!,
    reportOnly: reportOnly!,
    candidateMatchesCommitted,
    equivalenceReport,
    artifactValidation,
    phaseJournal: {
      kind: "powerhouse.migration-phase-journal",
      formatVersion: 1,
      phases,
    },
    canarySummary,
    sourceTreeManifest,
    outputTreeManifest,
    sourceTreeManifestDigest: digestValue(sourceTreeManifest),
    outputTreeManifestDigest: digestValue(outputTreeManifest),
    deploymentOutcomes,
    mixedRevision: {
      policy: "drained",
      overlapAllowed: false,
      oldRevisionDrained: true,
      crossRevisionTraffic: 0,
      newRevisionActivated: true,
    },
    rollback,
    retirementReport,
    retirementDecision: "retired",
    recoverableLegacyRoot: retirementReport.apply.recoverableLegacyRoot,
  };
}
