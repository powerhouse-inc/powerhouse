import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  canonicalJsonFromUnknown as canonical,
  compareCodeUnits,
  sha256,
} from "../definition/primitives.js";
import { relativePathWithin, toPosixPath } from "./file-path.js";

export type RetirementTargetV1 = {
  readonly path: string;
  readonly bytes: number;
  readonly digest: `sha256:${string}`;
};

export type RetirementPlanV1 = {
  readonly kind: "powerhouse.legacy-retirement-plan";
  readonly formatVersion: 1;
  readonly repositoryCommit: string;
  readonly family: {
    readonly documentType: string;
    readonly digest: `sha256:${string}`;
  };
  readonly packageRoot: ".";
  readonly legacyFamilyRoot: string;
  readonly recoverableLegacyRoot: string;
  readonly approvedReportPath: string;
  readonly activationMarkerPath: string;
  readonly rollbackReportPath: string;
  readonly canaryReportPath: string;
  readonly approvedReportDigest: `sha256:${string}`;
  readonly activationMarkerDigest: `sha256:${string}`;
  readonly rollbackReportDigest: `sha256:${string}`;
  readonly canaryReportDigest: `sha256:${string}`;
  readonly artifactDigest: `sha256:${string}`;
  readonly sourceTreeDigest: `sha256:${string}`;
  readonly targets: readonly RetirementTargetV1[];
  readonly liveImportPaths: readonly string[];
  readonly maskedVerificationPassed: true;
  readonly planDigest: `sha256:${string}`;
};

type Marker = {
  readonly status?: unknown;
  readonly familyDigest?: unknown;
  readonly family?: { readonly digest?: unknown };
  readonly artifactDigest?: unknown;
};

export class RetirementPlanError extends Error {
  readonly code: `PH-MIGRATE-${string}`;

  constructor(code: `PH-MIGRATE-${string}`, message: string) {
    super(message);
    this.name = "RetirementPlanError";
    this.code = code;
  }
}

function fail(code: `PH-MIGRATE-${string}`, message: string): never {
  throw new RetirementPlanError(code, message);
}

async function assertNoSymlinkComponents(
  root: string,
  candidate: string,
  options: { readonly allowMissing?: boolean } = {},
): Promise<void> {
  const relativePath = relativePathWithin(root, candidate);
  if (relativePath === null) {
    return fail(
      "PH-MIGRATE-RETIRE-PATH-OUTSIDE-ROOT",
      `Retirement path ${candidate} escapes the package root.`,
    );
  }
  if (relativePath === ".") return;

  let current = root;
  for (const segment of relativePath.split("/")) {
    current = join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        return fail(
          "PH-MIGRATE-RETIRE-SYMLINK",
          `Retirement path component ${current} is a symbolic link.`,
        );
      }
    } catch (error) {
      if (
        options.allowMissing === true &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }
  }
}

async function filesBelow(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) {
      fail(
        "PH-MIGRATE-RETIRE-SYMLINK",
        `Retirement target ${path} is a symbolic link.`,
      );
    }
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort((left, right) =>
    compareCodeUnits(toPosixPath(left), toPosixPath(right)),
  );
}

async function readJson(
  path: string,
): Promise<{ bytes: Buffer; value: Marker }> {
  const bytes = await readFile(path);
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")) as Marker };
  } catch {
    return fail(
      "PH-MIGRATE-RETIRE-EVIDENCE-INVALID",
      `Retirement evidence ${path} is not valid JSON.`,
    );
  }
}

function requireMarker(request: {
  readonly label: string;
  readonly marker: Marker;
  readonly statuses: readonly string[];
  readonly familyDigest: `sha256:${string}`;
  readonly artifactDigest?: `sha256:${string}`;
  readonly requireArtifact?: boolean;
}): `sha256:${string}` | null {
  const markerFamilyDigest =
    request.marker.familyDigest ?? request.marker.family?.digest;
  if (
    typeof request.marker.status !== "string" ||
    !request.statuses.includes(request.marker.status) ||
    markerFamilyDigest !== request.familyDigest ||
    (request.artifactDigest !== undefined &&
      request.marker.artifactDigest !== request.artifactDigest)
  ) {
    fail(
      "PH-MIGRATE-RETIRE-EVIDENCE-MISMATCH",
      `${request.label} does not approve the selected family and artifact.`,
    );
  }
  if (
    request.requireArtifact !== false &&
    typeof request.marker.artifactDigest !== "string"
  ) {
    fail(
      "PH-MIGRATE-RETIRE-EVIDENCE-INVALID",
      `${request.label} has no artifact digest.`,
    );
  }
  return typeof request.marker.artifactDigest === "string"
    ? (request.marker.artifactDigest as `sha256:${string}`)
    : null;
}

async function targetsFor(
  packageRoot: string,
  familyRoot: string,
): Promise<readonly RetirementTargetV1[]> {
  const files = await filesBelow(familyRoot);
  if (files.length === 0) {
    return fail(
      "PH-MIGRATE-RETIRE-TARGETS-EMPTY",
      "The legacy family contains no files to retire.",
    );
  }
  return Promise.all(
    files.map(async (path) => {
      const packagePath = relativePathWithin(packageRoot, path);
      const familyPath = relativePathWithin(familyRoot, path);
      if (packagePath === null || familyPath === null || familyPath === ".") {
        return fail(
          "PH-MIGRATE-RETIRE-PATH-OUTSIDE-ROOT",
          `Retirement target ${path} escapes its recorded roots.`,
        );
      }
      const bytes = await readFile(path);
      return {
        path: packagePath,
        bytes: bytes.byteLength,
        digest: sha256(bytes),
      };
    }),
  );
}

function sourceTreeDigest(
  targets: readonly RetirementTargetV1[],
): `sha256:${string}` {
  return sha256(canonical(targets));
}

export function deriveRetirementPlanDigest(
  plan: Omit<RetirementPlanV1, "planDigest">,
): `sha256:${string}` {
  return sha256(canonical(plan));
}

export async function createRetirementPlan(request: {
  readonly packageRoot: string;
  readonly legacyFamilyRoot: string;
  readonly repositoryCommit: string;
  readonly documentType: string;
  readonly familyDigest: `sha256:${string}`;
  readonly approvedReportPath: string;
  readonly activationMarkerPath: string;
  readonly rollbackReportPath: string;
  readonly canaryReportPath: string;
  readonly recoverableLegacyRoot: string;
  readonly liveImportPaths: readonly string[];
  readonly maskedVerificationPassed: boolean;
}): Promise<RetirementPlanV1> {
  const packageRoot = await realpath(resolve(request.packageRoot));
  const unresolvedFamilyRoot = resolve(packageRoot, request.legacyFamilyRoot);
  await assertNoSymlinkComponents(packageRoot, unresolvedFamilyRoot);
  const familyRoot = await realpath(unresolvedFamilyRoot);
  const familyRelative = relativePathWithin(packageRoot, familyRoot);
  if (familyRelative === null || familyRelative === ".") {
    return fail(
      "PH-MIGRATE-RETIRE-PATH-OUTSIDE-ROOT",
      "The legacy family root must be a strict child of the package root.",
    );
  }
  if (request.liveImportPaths.length > 0) {
    return fail(
      "PH-MIGRATE-RETIRE-LIVE-IMPORT",
      `Active sources still reference legacy targets: ${request.liveImportPaths.join(", ")}`,
    );
  }
  if (!request.maskedVerificationPassed) {
    return fail(
      "PH-MIGRATE-RETIRE-MASKED-VERIFY-FAILED",
      "Verification with the complete legacy target set masked did not pass.",
    );
  }
  if (!request.recoverableLegacyRoot.trim()) {
    return fail(
      "PH-MIGRATE-RETIRE-NOT-RECOVERABLE",
      "A committed or immutable recovery root is required.",
    );
  }
  const evidencePath = (path: string): string => {
    const absolute = resolve(packageRoot, path);
    const normalized = relativePathWithin(packageRoot, absolute);
    if (normalized === null || normalized === ".") {
      return fail(
        "PH-MIGRATE-RETIRE-PATH-OUTSIDE-ROOT",
        `Evidence path ${path} escapes the package root.`,
      );
    }
    return normalized;
  };
  const approvedReportPath = evidencePath(request.approvedReportPath);
  const activationMarkerPath = evidencePath(request.activationMarkerPath);
  const rollbackReportPath = evidencePath(request.rollbackReportPath);
  const canaryReportPath = evidencePath(request.canaryReportPath);
  await Promise.all(
    [
      approvedReportPath,
      activationMarkerPath,
      rollbackReportPath,
      canaryReportPath,
    ].map((path) =>
      assertNoSymlinkComponents(packageRoot, resolve(packageRoot, path)),
    ),
  );
  const [approved, activation, rollback, canary] = await Promise.all([
    readJson(resolve(packageRoot, approvedReportPath)),
    readJson(resolve(packageRoot, activationMarkerPath)),
    readJson(resolve(packageRoot, rollbackReportPath)),
    readJson(resolve(packageRoot, canaryReportPath)),
  ]);
  requireMarker({
    label: "approved equivalence report",
    marker: approved.value,
    statuses: ["equivalent"],
    familyDigest: request.familyDigest,
    requireArtifact: false,
  });
  const artifactDigest = requireMarker({
    label: "activation marker",
    marker: activation.value,
    statuses: ["active"],
    familyDigest: request.familyDigest,
  });
  if (artifactDigest === null) {
    return fail(
      "PH-MIGRATE-RETIRE-EVIDENCE-INVALID",
      "The activation marker has no artifact digest.",
    );
  }
  requireMarker({
    label: "rollback report",
    marker: rollback.value,
    statuses: ["pass"],
    familyDigest: request.familyDigest,
    artifactDigest,
  });
  requireMarker({
    label: "canary report",
    marker: canary.value,
    statuses: ["pass"],
    familyDigest: request.familyDigest,
    artifactDigest,
  });
  const targets = await targetsFor(packageRoot, familyRoot);
  const planWithoutDigest = {
    kind: "powerhouse.legacy-retirement-plan" as const,
    formatVersion: 1 as const,
    repositoryCommit: request.repositoryCommit,
    family: {
      documentType: request.documentType,
      digest: request.familyDigest,
    },
    packageRoot: "." as const,
    legacyFamilyRoot: familyRelative,
    recoverableLegacyRoot: request.recoverableLegacyRoot,
    approvedReportPath,
    activationMarkerPath,
    rollbackReportPath,
    canaryReportPath,
    approvedReportDigest: sha256(approved.bytes),
    activationMarkerDigest: sha256(activation.bytes),
    rollbackReportDigest: sha256(rollback.bytes),
    canaryReportDigest: sha256(canary.bytes),
    artifactDigest,
    sourceTreeDigest: sourceTreeDigest(targets),
    targets,
    liveImportPaths: [] as const,
    maskedVerificationPassed: true as const,
  };
  return {
    ...planWithoutDigest,
    planDigest: deriveRetirementPlanDigest(planWithoutDigest),
  };
}

async function assertPlanCurrent(request: {
  readonly packageRoot: string;
  readonly plan: RetirementPlanV1;
  readonly currentCommit: string;
}): Promise<void> {
  const { plan } = request;
  const { planDigest: _digest, ...planWithoutDigest } = plan;
  if (deriveRetirementPlanDigest(planWithoutDigest) !== plan.planDigest) {
    return fail(
      "PH-MIGRATE-RETIRE-PLAN-DIGEST-MISMATCH",
      "The retirement plan digest does not match its content.",
    );
  }
  if (plan.repositoryCommit !== request.currentCommit) {
    return fail(
      "PH-MIGRATE-RETIRE-COMMIT-MISMATCH",
      "The repository commit changed after plan approval.",
    );
  }
  const packageRoot = await realpath(resolve(request.packageRoot));
  const readEvidence = async (
    path: string,
    expectedDigest: `sha256:${string}`,
    label: string,
  ): Promise<Marker> => {
    const absolute = resolve(packageRoot, path);
    if (relativePathWithin(packageRoot, absolute) !== path) {
      return fail(
        "PH-MIGRATE-RETIRE-PATH-OUTSIDE-ROOT",
        `${label} path escapes the package root.`,
      );
    }
    await assertNoSymlinkComponents(packageRoot, absolute);
    const evidence = await readJson(absolute);
    if (sha256(evidence.bytes) !== expectedDigest) {
      return fail(
        "PH-MIGRATE-RETIRE-EVIDENCE-MISMATCH",
        `${label} changed after plan approval.`,
      );
    }
    return evidence.value;
  };
  const [approved, activation, rollback, canary] = await Promise.all([
    readEvidence(
      plan.approvedReportPath,
      plan.approvedReportDigest,
      "approved equivalence report",
    ),
    readEvidence(
      plan.activationMarkerPath,
      plan.activationMarkerDigest,
      "activation marker",
    ),
    readEvidence(
      plan.rollbackReportPath,
      plan.rollbackReportDigest,
      "rollback report",
    ),
    readEvidence(
      plan.canaryReportPath,
      plan.canaryReportDigest,
      "canary report",
    ),
  ]);
  requireMarker({
    label: "approved equivalence report",
    marker: approved,
    statuses: ["equivalent"],
    familyDigest: plan.family.digest,
    requireArtifact: false,
  });
  requireMarker({
    label: "activation marker",
    marker: activation,
    statuses: ["active"],
    familyDigest: plan.family.digest,
    artifactDigest: plan.artifactDigest,
  });
  requireMarker({
    label: "rollback report",
    marker: rollback,
    statuses: ["pass"],
    familyDigest: plan.family.digest,
    artifactDigest: plan.artifactDigest,
  });
  requireMarker({
    label: "canary report",
    marker: canary,
    statuses: ["pass"],
    familyDigest: plan.family.digest,
    artifactDigest: plan.artifactDigest,
  });
  const unresolvedFamilyRoot = resolve(packageRoot, plan.legacyFamilyRoot);
  await assertNoSymlinkComponents(packageRoot, unresolvedFamilyRoot);
  const familyRoot = await realpath(unresolvedFamilyRoot);
  if (relativePathWithin(packageRoot, familyRoot) !== plan.legacyFamilyRoot) {
    return fail(
      "PH-MIGRATE-RETIRE-PATH-OUTSIDE-ROOT",
      "The recorded legacy root no longer resolves inside the package root.",
    );
  }
  for (const target of plan.targets) {
    const path = resolve(packageRoot, target.path);
    if (
      relativePathWithin(packageRoot, path) !== target.path ||
      relativePathWithin(familyRoot, path) === null
    ) {
      return fail(
        "PH-MIGRATE-RETIRE-PATH-OUTSIDE-ROOT",
        `Target ${target.path} escapes its recorded roots.`,
      );
    }
  }
  const currentTargets = await targetsFor(packageRoot, familyRoot);
  if (sourceTreeDigest(currentTargets) !== plan.sourceTreeDigest) {
    return fail(
      "PH-MIGRATE-RETIRE-SOURCE-DRIFT",
      "The legacy source tree changed after plan approval.",
    );
  }
  if (canonical(currentTargets) !== canonical(plan.targets)) {
    return fail(
      "PH-MIGRATE-RETIRE-TARGET-SET-MISMATCH",
      "The current legacy target set differs from the approved plan.",
    );
  }
  for (const target of plan.targets) {
    const path = resolve(packageRoot, target.path);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
      return fail(
        "PH-MIGRATE-RETIRE-SYMLINK",
        `Target ${target.path} is a symbolic link.`,
      );
    }
    if (!metadata.isFile() || metadata.size !== target.bytes) {
      return fail(
        "PH-MIGRATE-RETIRE-SOURCE-DRIFT",
        `Target ${target.path} changed after approval.`,
      );
    }
    if (sha256(await readFile(path)) !== target.digest) {
      return fail(
        "PH-MIGRATE-RETIRE-SOURCE-DRIFT",
        `Target ${target.path} changed after approval.`,
      );
    }
  }
}

export type RetirementApplyReportV1 = {
  readonly kind: "powerhouse.legacy-retirement";
  readonly formatVersion: 1;
  readonly status: "retired";
  readonly planDigest: `sha256:${string}`;
  readonly removedPaths: readonly string[];
  readonly recoverableLegacyRoot: string;
};

async function restoreStaged(
  packageRoot: string,
  stagingRoot: string,
  staged: readonly RetirementTargetV1[],
): Promise<void> {
  for (const target of [...staged].reverse()) {
    const source = resolve(stagingRoot, target.path);
    const destination = resolve(packageRoot, target.path);
    await mkdir(dirname(destination), { recursive: true });
    await assertNoSymlinkComponents(packageRoot, source);
    await assertNoSymlinkComponents(packageRoot, dirname(destination));
    await rename(source, destination);
  }
}

export async function applyRetirementPlan(request: {
  readonly packageRoot: string;
  readonly plan: RetirementPlanV1;
  readonly currentCommit: string;
  readonly postStageCheck?: () => boolean | Promise<boolean>;
  readonly rollbackCheck?: () => boolean | Promise<boolean>;
}): Promise<RetirementApplyReportV1> {
  await assertPlanCurrent(request);
  const packageRoot = await realpath(resolve(request.packageRoot));
  const stagingRoot = resolve(
    packageRoot,
    ".ph",
    `retirement-${request.plan.planDigest.slice("sha256:".length, "sha256:".length + 16)}`,
  );
  await assertNoSymlinkComponents(packageRoot, dirname(stagingRoot), {
    allowMissing: true,
  });
  try {
    await stat(stagingRoot);
    return fail(
      "PH-MIGRATE-RETIRE-STAGE-EXISTS",
      "The retirement staging directory already exists.",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(stagingRoot, { recursive: true });
  await assertNoSymlinkComponents(packageRoot, stagingRoot);
  const staged: RetirementTargetV1[] = [];
  let restored = false;
  try {
    for (const target of request.plan.targets) {
      const source = resolve(packageRoot, target.path);
      const destination = resolve(stagingRoot, target.path);
      await mkdir(dirname(destination), { recursive: true });
      await assertNoSymlinkComponents(packageRoot, source);
      await assertNoSymlinkComponents(packageRoot, dirname(destination));
      await rename(source, destination);
      staged.push(target);
    }
    const postStagePassed = (await request.postStageCheck?.()) ?? true;
    if (!postStagePassed) {
      await restoreStaged(packageRoot, stagingRoot, staged);
      restored = true;
      const rollbackPassed = (await request.rollbackCheck?.()) ?? true;
      if (!rollbackPassed) {
        return fail(
          "PH-MIGRATE-ROLLBACK-FAILED",
          "Post-stage verification failed and the restored legacy tree did not pass rollback checks.",
        );
      }
      return fail(
        "PH-MIGRATE-POST-STAGE-FAILED",
        "Post-stage verification failed; the legacy tree was restored.",
      );
    }
    await rm(stagingRoot, { recursive: true, force: true });
    return {
      kind: "powerhouse.legacy-retirement",
      formatVersion: 1,
      status: "retired",
      planDigest: request.plan.planDigest,
      removedPaths: request.plan.targets.map(({ path }) => path),
      recoverableLegacyRoot: request.plan.recoverableLegacyRoot,
    };
  } catch (error) {
    if (staged.length > 0 && !restored) {
      await restoreStaged(packageRoot, stagingRoot, staged);
    }
    throw error;
  }
}
