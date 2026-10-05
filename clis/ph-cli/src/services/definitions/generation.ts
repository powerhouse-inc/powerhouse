import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import {
  checkDefinitions,
  DefinitionSourceLoader,
  exitCodeFor,
  type PackedConsumerEvidence,
} from "document-model/tooling";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { getVersion } from "../../get-version.js";
import { defaultHostValidationFor } from "./host-validation.js";
import { BuildGraphTypeScriptSourceImportAdapter } from "./import-adapters.js";
import { computePackageRevision, toPosixPath } from "./package-revision.js";

export const GENERATION_DIRECTORY = join(".ph", "build");

export type CandidateRequest = {
  readonly packageRoot: string;
  readonly candidateRoot: string;
  readonly outDir: string;
};

export type GenerationSteps = {
  readonly typecheck: (request: {
    readonly packageRoot: string;
    readonly emittedRoot: string;
  }) => Promise<
    | {
        readonly ok: false;
        readonly summary?: string;
      }
    | {
        readonly ok: true;
        readonly emittedModules: ReadonlyMap<string, string>;
        readonly declarationSubdirectory: string | null;
      }
  >;
  readonly emitCandidate: (request: {
    readonly packageRoot: string;
    readonly candidateRoot: string;
  }) => Promise<{ readonly ok: boolean; readonly summary?: string }>;
  readonly verifyPackedConsumers: (
    request: CandidateRequest,
  ) => Promise<PackedConsumerEvidence>;
  readonly promote: (request: CandidateRequest) => Promise<void>;
};

type GenerationRequest = {
  readonly packageRoot: string;
  readonly configFile: string;
  readonly allowMissingConfig?: boolean;
  readonly outDir: string;
  readonly cliSources?: readonly string[] | undefined;
  readonly warningsAsErrors: boolean;
  readonly steps: GenerationSteps;
  readonly log: (text: string) => void;
  readonly promoteOutput?: boolean;
};

export type GenerationPhase =
  | "typecheck"
  | "definitions"
  | "candidate"
  | "packed"
  | "promote";

export type GenerationResult = {
  readonly status: "ok" | "invalid" | "failed";
  readonly exitCode: 0 | 1 | 2;
  readonly phases: readonly GenerationPhase[];
  readonly report: DefinitionCheckReport | undefined;
};

export type ReleaseApproval = {
  readonly kind: "powerhouse.release-approval";
  readonly formatVersion: 1;
  readonly packageRevision: `sha256:${string}`;
  readonly sourceSetDigest: string;
  readonly compilerVersion: string;
  readonly outputDigest: string;
  readonly warningsAsErrors: boolean;
  readonly report: DefinitionCheckReport;
};

const APPROVAL_FILE = "release-approval.json";

function approvalPath(packageRoot: string): string {
  return join(packageRoot, GENERATION_DIRECTORY, APPROVAL_FILE);
}

export function directoryDigest(root: string): string {
  return existsSync(root)
    ? computePackageRevision({
        packageRoot: root,
        excludedDirectoryNames: [],
        bindings: {},
      })
    : "absent";
}

class CandidateBundleError extends Error {
  constructor(summary: string) {
    super(summary);
    this.name = "CandidateBundleError";
  }
}

export function pathWithin(root: string, path: string): string | null {
  const inside = relative(root, path);
  return inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)
    ? null
    : inside;
}

export function assertOutputDirectory(
  packageRoot: string,
  outDir: string,
): void {
  const target = resolve(packageRoot, outDir);
  const isInside = (root: string, path: string): boolean =>
    (pathWithin(root, path) ?? "") !== "";
  let physicallyInside = false;
  if (isInside(resolve(packageRoot), target)) {
    let ancestor = target;
    while (lstatSync(ancestor, { throwIfNoEntry: false }) === undefined) {
      ancestor = dirname(ancestor);
    }
    try {
      physicallyInside = isInside(
        realpathSync.native(packageRoot),
        resolve(realpathSync.native(ancestor), relative(ancestor, target)),
      );
    } catch {
      physicallyInside = false;
    }
  }
  if (!physicallyInside) {
    throw new Error(
      `--out-dir must name a directory inside the package; ${JSON.stringify(outDir)} does not.`,
    );
  }
}

export function packageRevisionOf(
  packageRoot: string,
  outDir: string,
): `sha256:${string}` {
  return computePackageRevision({
    packageRoot,
    excludedDirectories: [outDir],
    respectGitignore: true,
    bindings: { compiler: getVersion() },
  });
}

const pendingGenerations = new Map<string, Promise<void>>();

export async function runGeneration(
  request: GenerationRequest,
): Promise<GenerationResult> {
  const packageRoot = realpathSync.native(request.packageRoot);
  const previous = pendingGenerations.get(packageRoot) ?? Promise.resolve();
  const pending = previous.then(async () => {
    try {
      return await generate({ ...request, packageRoot });
    } finally {
      discardScratch(packageRoot);
    }
  });
  const settled = pending.then(
    () => undefined,
    () => undefined,
  );
  pendingGenerations.set(packageRoot, settled);
  try {
    return await pending;
  } finally {
    if (pendingGenerations.get(packageRoot) === settled) {
      pendingGenerations.delete(packageRoot);
    }
  }
}

function discardScratch(packageRoot: string): void {
  const root = join(packageRoot, GENERATION_DIRECTORY);
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    if (entry === APPROVAL_FILE) continue;
    rmSync(join(root, entry), { recursive: true, force: true });
  }
}

async function generate(request: GenerationRequest): Promise<GenerationResult> {
  const { log } = request;
  assertOutputDirectory(request.packageRoot, request.outDir);
  const promoteOutput = request.promoteOutput !== false;
  const phases: GenerationPhase[] = [];
  const packageRevision = packageRevisionOf(
    request.packageRoot,
    request.outDir,
  );
  const generationRoot = join(request.packageRoot, GENERATION_DIRECTORY);
  const candidateRoot = join(generationRoot, "candidate");
  // Each revision gets its own directory because Node caches an ESM module by
  // URL for the life of the process, so a second generation staged to the same
  // path would check the first one's modules.
  const emittedRoot = join(
    generationRoot,
    "types",
    packageRevision.slice("sha256:".length, "sha256:".length + 16),
  );
  rmSync(generationRoot, { recursive: true, force: true });
  mkdirSync(emittedRoot, { recursive: true });
  mkdirSync(candidateRoot, { recursive: true });

  const failure = (
    status: "invalid" | "failed",
    report?: DefinitionCheckReport,
  ): GenerationResult => ({
    status,
    exitCode: status === "invalid" ? 1 : 2,
    phases,
    report,
  });

  log("▶ Compiling TypeScript\n");
  phases.push("typecheck");
  const typecheck = await request.steps.typecheck({
    packageRoot: request.packageRoot,
    emittedRoot,
  });
  if (!typecheck.ok) {
    log("✘ TypeScript failed; no definition was evaluated.\n");
    if (typecheck.summary !== undefined) log(`${typecheck.summary}\n`);
    return failure("failed");
  }

  const loader = new DefinitionSourceLoader(
    new BuildGraphTypeScriptSourceImportAdapter({
      packageRoot: request.packageRoot,
      emittedModules: typecheck.emittedModules,
    }),
  );

  const assembleCandidate = async (): Promise<void> => {
    log("▶ Emitting candidate bundles\n");
    phases.push("candidate");
    const candidate = await request.steps.emitCandidate({
      packageRoot: request.packageRoot,
      candidateRoot,
    });
    if (!candidate.ok) {
      throw new CandidateBundleError(
        candidate.summary ?? "the candidate bundle failed",
      );
    }
    const subdirectory = typecheck.declarationSubdirectory;
    if (subdirectory !== null) {
      stageDeclarations({ emittedRoot, candidateRoot, subdirectory });
    }
    relocateSourceMaps(
      candidateRoot,
      resolve(request.packageRoot, request.outDir),
    );
  };

  const promote = async (): Promise<void> => {
    if (!promoteOutput) return;
    assertOutputDirectory(request.packageRoot, request.outDir);
    log("▶ Promoting the candidate\n");
    phases.push("promote");
    await request.steps.promote({
      packageRoot: request.packageRoot,
      candidateRoot,
      outDir: request.outDir,
    });
  };

  const buildWithoutEvidence = async (): Promise<GenerationResult> => {
    try {
      await assembleCandidate();
    } catch (error) {
      log(
        `✘ The candidate bundle failed.\n${error instanceof Error ? error.message : String(error)}\n`,
      );
      return failure("failed");
    } finally {
      await loader.dispose();
    }
    await promote();
    return { status: "ok", exitCode: 0, phases, report: undefined };
  };

  if (
    request.allowMissingConfig &&
    request.cliSources === undefined &&
    !existsSync(request.configFile)
  ) {
    log(
      "⚠ This package declares no definitionSources. Add one; a future release will fail this build.\n",
    );
    return await buildWithoutEvidence();
  }

  const resolution = loader.resolve({
    configFile: request.configFile,
    ...(request.cliSources !== undefined && { cliSources: request.cliSources }),
  });
  if (resolution.status === "skipped") {
    log(
      'ℹ This package declares definitionSources mode "schema-first"; no definition was checked.\n',
    );
    return await buildWithoutEvidence();
  }
  if (resolution.reason === "sources-undeclared") {
    log(
      "⚠ This package declares no definitionSources. Add one; a future release will fail this build.\n",
    );
    return await buildWithoutEvidence();
  }

  let report: DefinitionCheckReport;
  try {
    log("▶ Checking definitions\n");
    phases.push("definitions");
    report = await checkDefinitions({
      profile: "release",
      loader,
      packageRevision,
      configFile: request.configFile,
      ...(request.cliSources !== undefined && {
        cliSources: request.cliSources,
      }),
      warningsAsErrors: request.warningsAsErrors,
      hostValidation: defaultHostValidationFor(request.packageRoot),
      releaseEvidence: {
        typecheck: () => typecheck,
        verifyPackedConsumers: async () => {
          await assembleCandidate();
          log("▶ Verifying packed consumers\n");
          phases.push("packed");
          return await request.steps.verifyPackedConsumers({
            packageRoot: request.packageRoot,
            candidateRoot,
            outDir: request.outDir,
          });
        },
      },
    });
  } catch (error) {
    if (!(error instanceof CandidateBundleError)) throw error;
    log(`✘ The candidate bundle failed.\n${error.message}\n`);
    return failure("failed");
  } finally {
    await loader.dispose();
  }

  if (report.status !== "ok") {
    log(`✘ ${report.status}\n`);
    return failure(report.status === "invalid" ? "invalid" : "failed", report);
  }

  if (
    packageRevisionOf(request.packageRoot, request.outDir) !== packageRevision
  ) {
    log("✘ The package changed while it was being checked.\n");
    return failure("failed", report);
  }

  const approval: ReleaseApproval = {
    kind: "powerhouse.release-approval",
    formatVersion: 1,
    packageRevision,
    sourceSetDigest: report.sourceSet.digest,
    compilerVersion: getVersion(),
    outputDigest: directoryDigest(candidateRoot),
    warningsAsErrors: request.warningsAsErrors,
    report,
  };

  await promote();
  if (promoteOutput) {
    if (
      directoryDigest(resolve(request.packageRoot, request.outDir)) !==
      approval.outputDigest
    ) {
      log("✘ The published output differs from the verified candidate.\n");
      return failure("failed", report);
    }
    writeFileSync(approvalPath(request.packageRoot), JSON.stringify(approval));
  }

  return { status: "ok", exitCode: exitCodeFor(report), phases, report };
}

type ApprovalCheck =
  | { readonly ok: true; readonly approval: ReleaseApproval }
  | { readonly ok: false; readonly reason: string };

function isReleaseApproval(value: unknown): value is ReleaseApproval {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<ReleaseApproval>;
  return (
    candidate.kind === "powerhouse.release-approval" &&
    candidate.formatVersion === 1 &&
    typeof candidate.packageRevision === "string" &&
    typeof candidate.compilerVersion === "string" &&
    typeof candidate.outputDigest === "string" &&
    typeof candidate.warningsAsErrors === "boolean" &&
    candidate.report?.kind === "powerhouse.definition-check"
  );
}

export function readRetainedApproval(request: {
  readonly packageRoot: string;
  readonly outDir: string;
  readonly warningsAsErrors: boolean;
  readonly sourceSetDigest: string;
}): ApprovalCheck {
  const path = approvalPath(request.packageRoot);
  if (!existsSync(path)) {
    return { ok: false, reason: "no completed release check was retained" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { ok: false, reason: "the retained release check is unreadable" };
  }
  if (!isReleaseApproval(parsed)) {
    return { ok: false, reason: "the retained release check is malformed" };
  }
  const approval = parsed;
  if (approval.report.profile !== "release") {
    return {
      ok: false,
      reason: "the retained check ran the edit profile, which approves nothing",
    };
  }
  if (approval.report.status !== "ok") {
    return {
      ok: false,
      reason: `the retained check reported ${approval.report.status}`,
    };
  }
  if (approval.compilerVersion !== getVersion()) {
    return { ok: false, reason: "the compiler changed since that check" };
  }
  if (approval.warningsAsErrors !== request.warningsAsErrors) {
    return { ok: false, reason: "the warning policy changed since that check" };
  }
  if (approval.sourceSetDigest !== request.sourceSetDigest) {
    return {
      ok: false,
      reason: "the selected definition sources changed since that check",
    };
  }
  if (
    approval.packageRevision !==
    packageRevisionOf(request.packageRoot, request.outDir)
  ) {
    return { ok: false, reason: "the package changed since that check" };
  }
  if (
    approval.outputDigest !==
    directoryDigest(resolve(request.packageRoot, request.outDir))
  ) {
    return {
      ok: false,
      reason: "the published output changed since that check",
    };
  }
  return { ok: true, approval };
}

export function stageDeclarations(options: {
  readonly emittedRoot: string;
  readonly candidateRoot: string;
  readonly subdirectory: string;
}): void {
  const into = join(options.candidateRoot, options.subdirectory);
  for (const file of readdirSync(options.emittedRoot, {
    recursive: true,
    encoding: "utf8",
  })) {
    if (!/\.d\.[cm]?ts(?:\.map)?$/.test(file)) continue;
    const from = join(options.emittedRoot, file);
    if (!statSync(from).isFile()) continue;
    const to = join(into, file);
    mkdirSync(dirname(to), { recursive: true });
    if (file.endsWith(".map")) {
      writeFileSync(
        to,
        relocateSourceMap(
          readFileSync(from, "utf8"),
          dirname(from),
          dirname(to),
        ),
      );
    } else {
      cpSync(from, to);
    }
  }
}

function relocateSourceMaps(candidateRoot: string, outputRoot: string): void {
  for (const file of readdirSync(candidateRoot, {
    recursive: true,
    encoding: "utf8",
  })) {
    if (!file.endsWith(".map")) continue;
    const path = join(candidateRoot, file);
    writeFileSync(
      path,
      relocateSourceMap(
        readFileSync(path, "utf8"),
        dirname(path),
        dirname(join(outputRoot, file)),
      ),
    );
  }
}

function relocateSourceMap(
  text: string,
  writtenIn: string,
  servedFrom: string,
): string {
  const map = JSON.parse(text) as { sources?: unknown; sourceRoot?: unknown };
  if (!Array.isArray(map.sources) || (map.sourceRoot ?? "") !== "") {
    return text;
  }
  return JSON.stringify({
    ...map,
    sources: map.sources.map((source: unknown) =>
      typeof source === "string" && !/^[a-z][a-z\d+.-]*:/i.test(source)
        ? toPosixPath(relative(servedFrom, resolve(writtenIn, source)))
        : source,
    ),
  });
}
