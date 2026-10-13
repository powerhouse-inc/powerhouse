import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import {
  checkDefinitions,
  DefinitionSourceLoader,
  exitCodeFor,
  findCodeFirstDefinitions,
  findUnregisteredDefinitions,
  formatDefinitionDiagnostic,
  type PackedConsumerEvidence,
  unregisteredDefinitionDiagnostic,
} from "document-model/tooling";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { getVersion } from "../../get-version.js";
import {
  movedDeclaration,
  planDeclarations,
  publishedPaths,
  stageDeclarations,
  unlandedDeclaration,
  writeOutsideOutput,
} from "./declarations.js";
import { defaultHostValidationFor } from "./host-validation.js";
import { relocateSourceMaps } from "./source-maps.js";
import { BuildGraphTypeScriptSourceImportAdapter } from "./import-adapters.js";
import {
  computePackageRevision,
  filesDigest,
  toPosixPath,
} from "./package-revision.js";
import {
  canonicalConfigFile,
  canonicalPath,
  pathWithin,
  resolvePackagePaths,
} from "./paths.js";

export const GENERATION_DIRECTORY = join(".ph", "build");

const NOTHING_CHECKED =
  "ℹ This package lists no code-first definitionSources; no definition was checked.\n";

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
        readonly refused?: false;
        readonly summary?: string;
      }
    // Refused for a reason that is not a compiler error.
    | { readonly ok: false; readonly refused: true; readonly summary: string }
    | {
        readonly ok: true;
        readonly emittedModules: ReadonlyMap<string, string>;
        // Where tsc writes the declarations it laid out under emittedRoot;
        // null when the package publishes none.
        readonly declarationDirectory: string | null;
        // The declaration files of the program main would build, as tsc
        // spells them: tsc never writes a declaration over one of those
        // paths (TS5055), and the build refuses one reached through a
        // symlink as well.
        readonly inputs: readonly string[];
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
  // Why the build refused, when no report or compiler output says it.
  readonly summary?: string;
};

export type ReleaseApproval = {
  readonly kind: "powerhouse.release-approval";
  readonly formatVersion: 2;
  readonly packageRevision: `sha256:${string}`;
  readonly sourceSetDigest: string;
  readonly sources: readonly string[];
  readonly sourcesDigest: string;
  readonly compilerVersion: string;
  readonly outputDigest: string;
  readonly declarations: readonly string[];
  readonly declarationsDigest: string;
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

export function assertOutputDirectory(
  packageRoot: string,
  outDir: string,
): void {
  const paths = resolvePackagePaths({ packageRoot, outDir });
  const target = resolve(paths.packageRoot, paths.outDir);
  const isInside = (root: string, path: string): boolean =>
    (pathWithin(root, path) ?? "") !== "";
  let output: string | undefined;
  try {
    output = canonicalPath(target);
  } catch {
    output = undefined;
  }
  if (
    output === undefined ||
    !isInside(paths.packageRoot, target) ||
    !isInside(paths.packageRoot, output)
  ) {
    throw new Error(
      `--out-dir must name a directory inside the package; ${JSON.stringify(outDir)} does not.`,
    );
  }
  const scratch = canonicalPath(join(paths.packageRoot, GENERATION_DIRECTORY));
  if (
    pathWithin(scratch, output) !== null ||
    pathWithin(output, scratch) !== null
  ) {
    throw new Error(
      `--out-dir must not overlap ${GENERATION_DIRECTORY}, which every build clears; ${JSON.stringify(outDir)} does.`,
    );
  }
}

export function packageRevisionOf(
  packageRoot: string,
  outDir: string,
  outputs: readonly string[] = [],
): `sha256:${string}` {
  const paths = resolvePackagePaths({ packageRoot, outDir });
  return computePackageRevision({
    packageRoot: paths.packageRoot,
    excludedPaths: [paths.outDir, ...outputs],
    respectGitignore: true,
    bindings: { compiler: getVersion() },
  });
}

const pendingGenerations = new Map<string, Promise<void>>();

export async function runGeneration(
  request: GenerationRequest,
): Promise<GenerationResult> {
  const paths = resolvePackagePaths(request);
  const { packageRoot } = paths;
  const configFile = canonicalConfigFile(request.configFile);
  const previous = pendingGenerations.get(packageRoot) ?? Promise.resolve();
  const pending = previous.then(async () => {
    try {
      return await generate({ ...request, ...paths, configFile });
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
  const declarationsRoot = join(generationRoot, "declarations");
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
  mkdirSync(declarationsRoot, { recursive: true });

  const failure = (
    status: "invalid" | "failed",
    report?: DefinitionCheckReport,
  ): GenerationResult => ({
    status,
    exitCode: status === "invalid" ? 1 : 2,
    phases,
    report,
  });
  const refusal = (
    summary: string,
    report?: DefinitionCheckReport,
  ): GenerationResult => {
    log(`✘ ${summary}\n`);
    return { ...failure("failed", report), summary };
  };

  log("▶ Compiling TypeScript\n");
  phases.push("typecheck");
  const typecheck = await request.steps.typecheck({
    packageRoot: request.packageRoot,
    emittedRoot,
  });
  if (!typecheck.ok) {
    if (typecheck.refused === true) {
      return refusal(typecheck.summary);
    }
    log("✘ TypeScript failed; no definition was evaluated.\n");
    if (typecheck.summary !== undefined) log(`${typecheck.summary}\n`);
    return failure("failed");
  }
  const plan = planDeclarations({
    packageRoot: request.packageRoot,
    outDir: request.outDir,
    emittedRoot,
    directory: typecheck.declarationDirectory,
    inputs: typecheck.inputs,
    scratch: canonicalPath(generationRoot),
  });
  if (!plan.ok) return refusal(plan.summary);
  const { declarations } = plan;
  const roots = { candidateRoot, declarationsRoot };

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
    relocateSourceMaps(
      candidateRoot,
      resolve(request.packageRoot, request.outDir),
    );
    stageDeclarations(declarations, roots);
  };

  const promote = async (
    report?: DefinitionCheckReport,
  ): Promise<GenerationResult | undefined> => {
    if (!promoteOutput) return undefined;
    assertOutputDirectory(request.packageRoot, request.outDir);
    const moved = movedDeclaration(declarations);
    if (moved !== undefined) {
      return refusal(
        `The declaration ${JSON.stringify(moved.target)} no longer resolves where the build planned it; nothing was promoted.`,
        report,
      );
    }
    log("▶ Promoting the candidate\n");
    phases.push("promote");
    await request.steps.promote({
      packageRoot: request.packageRoot,
      candidateRoot,
      outDir: request.outDir,
    });
    // Replacing the output directory removes any symlink inside it that a
    // configured declaration path went through.
    const cut = movedDeclaration(declarations);
    if (cut !== undefined) {
      return refusal(
        `Promoting the output changed where ${JSON.stringify(cut.configured)} resolves; the declarations outside the output directory were not written.`,
        report,
      );
    }
    try {
      writeOutsideOutput(declarations, roots);
    } catch (error) {
      return refusal(
        `The output was promoted, but the declarations outside it could not be written: ${error instanceof Error ? error.message : String(error)}`,
        report,
      );
    }
    const missing = unlandedDeclaration(declarations, roots);
    if (missing !== undefined) {
      return refusal(
        `After promotion ${JSON.stringify(missing.configured)} does not hold the declaration the build wrote; a symlink in the output directory may have led it there.`,
        report,
      );
    }
    return undefined;
  };

  const buildWithoutEvidence = async (): Promise<GenerationResult> => {
    try {
      await assembleCandidate();
    } catch (error) {
      return refusal(
        `The candidate bundle failed.\n${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await loader.dispose();
    }
    return (
      (await promote()) ?? {
        status: "ok",
        exitCode: 0,
        phases,
        report: undefined,
      }
    );
  };

  if (
    request.allowMissingConfig &&
    request.cliSources === undefined &&
    !existsSync(request.configFile)
  ) {
    const unregistered = findCodeFirstDefinitions(request.packageRoot);
    if (unregistered.length > 0) {
      for (const definition of unregistered) {
        log(
          `✘ ${formatDefinitionDiagnostic(unregisteredDefinitionDiagnostic(definition, "schema-first"))}\n`,
        );
      }
      return failure("failed");
    }
    log(NOTHING_CHECKED);
    return await buildWithoutEvidence();
  }

  const resolution = loader.resolve({
    configFile: request.configFile,
    ...(request.cliSources !== undefined && { cliSources: request.cliSources }),
  });
  if (
    resolution.status === "skipped" &&
    findUnregisteredDefinitions(resolution).length === 0
  ) {
    log(NOTHING_CHECKED);
    return await buildWithoutEvidence();
  }

  const published = publishedPaths(declarations);
  // Taken while the package is as the check sees it: the guard after the
  // check proves nothing changed since the build started.
  const approvalRevision = packageRevisionOf(
    request.packageRoot,
    request.outDir,
    published,
  );
  const sources = [...typecheck.emittedModules.keys()]
    .map((source) => toPosixPath(relative(request.packageRoot, source)))
    .sort();
  const sourcesDigest = filesDigest(request.packageRoot, sources);

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
    return refusal(`The candidate bundle failed.\n${error.message}`);
  } finally {
    await loader.dispose();
  }

  if (report.status !== "ok") {
    log(`✘ ${report.status}\n`);
    return failure(report.status === "invalid" ? "invalid" : "failed", report);
  }

  if (
    packageRevisionOf(request.packageRoot, request.outDir) !==
      packageRevision ||
    filesDigest(request.packageRoot, sources) !== sourcesDigest
  ) {
    return refusal("The package changed while it was being checked.", report);
  }

  const approval: ReleaseApproval = {
    kind: "powerhouse.release-approval",
    formatVersion: 2,
    packageRevision: approvalRevision,
    sourceSetDigest: report.sourceSet.digest,
    sources,
    sourcesDigest,
    compilerVersion: getVersion(),
    outputDigest: directoryDigest(candidateRoot),
    declarations: published,
    declarationsDigest: filesDigest(declarationsRoot, published),
    warningsAsErrors: request.warningsAsErrors,
    report,
  };

  const refused = await promote(report);
  if (refused !== undefined) return refused;
  if (promoteOutput) {
    if (
      directoryDigest(resolve(request.packageRoot, request.outDir)) !==
        approval.outputDigest ||
      filesDigest(request.packageRoot, published) !==
        approval.declarationsDigest
    ) {
      return refusal(
        "The published output differs from the verified candidate.",
        report,
      );
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
    candidate.formatVersion === 2 &&
    typeof candidate.packageRevision === "string" &&
    Array.isArray(candidate.sources) &&
    candidate.sources.every((path) => typeof path === "string") &&
    typeof candidate.sourcesDigest === "string" &&
    typeof candidate.compilerVersion === "string" &&
    typeof candidate.outputDigest === "string" &&
    Array.isArray(candidate.declarations) &&
    candidate.declarations.every((path) => typeof path === "string") &&
    typeof candidate.declarationsDigest === "string" &&
    typeof candidate.warningsAsErrors === "boolean" &&
    candidate.report?.kind === "powerhouse.definition-check"
  );
}

export function readRetainedApproval(input: {
  readonly packageRoot: string;
  readonly outDir: string;
  readonly warningsAsErrors: boolean;
  readonly sourceSetDigest: string;
}): ApprovalCheck {
  const request = { ...input, ...resolvePackagePaths(input) };
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
  if (
    (parsed as Partial<ReleaseApproval> | null)?.kind ===
      "powerhouse.release-approval" &&
    (parsed as Partial<ReleaseApproval>).formatVersion !== 2
  ) {
    return {
      ok: false,
      reason: "the retained release check was made by another ph version",
    };
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
    packageRevisionOf(
      request.packageRoot,
      request.outDir,
      approval.declarations,
    )
  ) {
    return { ok: false, reason: "the package changed since that check" };
  }
  if (
    approval.sourcesDigest !==
    filesDigest(request.packageRoot, approval.sources)
  ) {
    return { ok: false, reason: "a compiled source changed since that check" };
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
  if (
    approval.declarationsDigest !==
    filesDigest(request.packageRoot, approval.declarations)
  ) {
    return {
      ok: false,
      reason: "the published declarations changed since that check",
    };
  }
  return { ok: true, approval };
}
