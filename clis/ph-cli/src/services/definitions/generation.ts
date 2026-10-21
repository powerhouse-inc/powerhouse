import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import {
  checkDefinitions,
  DefinitionSourceLoader,
  exitCodeFor,
  findCodeFirstDefinitions,
  resolveDefinitionSelection,
  findUnregisteredDefinitions,
  formatDefinitionDiagnostic,
  type PackedConsumerEvidence,
  subgraphEntrySpecifiers,
  unregisteredDefinitionDiagnostic,
} from "document-model/tooling";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { getVersion } from "../../get-version.js";
import {
  listPublishedFiles,
  publishedFileSetDigest,
  type PublishedFileSet,
} from "./published-files.js";
import {
  compilePlanInputs,
  CompilePreflightError,
  type CompilePlan,
  type CompilePreflight,
  type OutputInventory,
} from "./compiler.js";
import {
  APPROVAL_FILE,
  APPROVAL_FORMAT_VERSION,
  approvalPath,
  captureBuildState,
  changedBuildState,
  type BuildStateInput,
  type ReleaseApproval,
} from "./release-approval.js";
import { defaultHostValidationFor } from "./host-validation.js";
import { relocateSourceMaps } from "./source-maps.js";
import { BuildGraphTypeScriptSourceImportAdapter } from "./import-adapters.js";
import {
  directoryDigest,
  PackageRevisionError,
  toPosixPath,
} from "./package-revision.js";
import {
  canonicalConfigFile,
  canonicalPath,
  pathWithin,
  resolvePackagePaths,
  scratchDirectory,
  ScratchDirectoryError,
} from "./paths.js";
import { legacySubgraphHints } from "./legacy-subgraph-hint.js";

export function reportSharedBase(write: (text: string) => void) {
  return ({ value }: { readonly value: { readonly name: string } }) =>
    write(`ℹ ${value.name} is accepted as a shared subgraph base.\n`);
}

export const GENERATION_DIRECTORY = join(".ph", "build");

const NOTHING_CHECKED =
  "ℹ This package lists no code-first definitionSources and has no subgraphs; no definition was checked.\n";

export type CandidateRequest = {
  readonly packageRoot: string;
  readonly candidateRoot: string;
  readonly outDir: string;
  readonly recordPublishedFiles?: (publication: PublishedFileSet) => void;
};

export type GenerationSteps = {
  readonly preflight: (
    packageRoot: string,
    loadDefinitions: boolean,
  ) => Promise<CompilePreflight>;
  readonly typecheck: (request: {
    readonly packageRoot: string;
    readonly emittedRoot: string;
    readonly plan: CompilePlan;
    // Called before each tsc run; a build that promotes nothing restores these outputs.
    readonly retainOutputs: (plan: CompilePlan) => void;
  }) => Promise<
    | {
        readonly ok: false;
        readonly summary?: string;
      }
    | {
        readonly ok: true;
        readonly emittedModules: ReadonlyMap<string, string>;
        readonly typeErrorsAccepted: boolean;
        readonly disposeLoader?: () => void;
        readonly diagnostics?: string;
        readonly loaderDiagnostics: string;
        readonly loadedRuntimeFiles: () => {
          readonly files: readonly string[];
          readonly digest: string;
        };
        readonly plan: CompilePlan;
      }
  >;
  readonly emitCandidate: (request: {
    readonly packageRoot: string;
    readonly candidateRoot: string;
    readonly subgraphNames: readonly string[];
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
  readonly compilerOutputs?: OutputInventory;
  readonly typeErrorsAccepted?: boolean;
};

class CandidateBundleError extends Error {
  constructor(summary: string) {
    super(summary);
    this.name = "CandidateBundleError";
  }
}

export function assertOutputDirectory(
  packageRoot: string,
  outDir: string,
): string {
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
  const scratch = scratchDirectory(paths.packageRoot);
  if (
    pathWithin(scratch, output) !== null ||
    pathWithin(output, scratch) !== null
  ) {
    throw new Error(
      `--out-dir must not overlap ${GENERATION_DIRECTORY}, which every build clears; ${JSON.stringify(outDir)} does.`,
    );
  }
  return output;
}

function movedCompilerDestination(plan: CompilePlan): string | undefined {
  return plan.destinations.find(({ configured, target }) => {
    try {
      return canonicalPath(configured) !== target;
    } catch {
      return true;
    }
  })?.configured;
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
    let scratchRoot: string | undefined;
    try {
      const entry = scratchDirectory(packageRoot);
      const outputTarget = assertOutputDirectory(packageRoot, paths.outDir);
      const selection = resolveDefinitionSelection({
        configFile,
        ...(request.cliSources !== undefined && {
          cliSources: request.cliSources,
        }),
      });
      const preflight = await request.steps.preflight(
        packageRoot,
        (selection.status === "ready" &&
          selection.sourceSet.mode === "code-first") ||
          subgraphEntrySpecifiers(packageRoot).length > 0,
      );
      if (!preflight.ok) {
        request.log(`✘ ${preflight.summary}\n`);
        return {
          status: "failed",
          exitCode: 2,
          phases: ["typecheck"],
          report: undefined,
          summary: preflight.summary,
        } satisfies GenerationResult;
      }
      // Remove the entry before resolving it: a build symlink's target is not scratch.
      rmSync(entry, { recursive: true, force: true });
      mkdirSync(entry, { recursive: true });
      scratchRoot = canonicalPath(entry);
      const retained: RetainedOutputs = {
        files: new Map(),
        directories: new Set(),
      };
      let result: GenerationResult;
      try {
        result = await generate(
          {
            ...request,
            ...paths,
            configFile,
            scratchRoot,
            outputTarget,
            retainOutputs: (plan) => retainOutputs(retained, packageRoot, plan),
          },
          preflight.plan,
        );
      } catch (error) {
        restoreOutputs(retained, request.log);
        throw error;
      }
      if (!result.phases.includes("promote"))
        restoreOutputs(retained, request.log);
      return result;
    } catch (error) {
      if (
        !(
          error instanceof ScratchDirectoryError ||
          error instanceof PackageRevisionError
        )
      )
        throw error;
      request.log(`✘ ${error.message}\n`);
      return {
        status: "failed",
        exitCode: 2,
        phases: [],
        report: undefined,
        summary: error.message,
      } satisfies GenerationResult;
    } finally {
      if (scratchRoot !== undefined) discardScratch(scratchRoot);
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

// tsc writes its outputs before any check runs. The pre-build files, with
// their timestamps, are a state tsc rebuilds from: build info older than the
// sources makes the next run emit again.
type RetainedOutputs = {
  readonly files: Map<
    string,
    { readonly content: Buffer; readonly stats: Stats } | "absent"
  >;
  readonly directories: Set<string>;
};

function retainOutputs(
  retained: RetainedOutputs,
  packageRoot: string,
  plan: CompilePlan,
): void {
  for (const file of plan.outputs.files) {
    // Canonical: a link repointed during the build must not redirect the restore.
    const path = canonicalPath(resolve(packageRoot, file), {
      resolveMissingLinks: true,
    });
    if (retained.files.has(path)) continue;
    const stats = statSync(path, { throwIfNoEntry: false });
    if (stats?.isFile())
      retained.files.set(path, { content: readFileSync(path), stats });
    if (stats !== undefined) continue;
    retained.files.set(path, "absent");
    let parent = dirname(path);
    while (!existsSync(parent)) {
      retained.directories.add(parent);
      parent = dirname(parent);
    }
  }
}

function restoreOutputs(
  { files, directories }: RetainedOutputs,
  log: (text: string) => void,
): void {
  // Build info first: if a later write fails, tsc still emits again.
  const entries = [...files].sort(
    ([a], [b]) =>
      Number(/\.tsbuildinfo$/i.test(b)) - Number(/\.tsbuildinfo$/i.test(a)),
  );
  try {
    for (const [path, file] of entries) {
      if (file === "absent") {
        rmSync(path, { force: true });
        continue;
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file.content);
      utimesSync(path, file.stats.atime, file.stats.mtime);
    }
    for (const directory of [...directories].sort().reverse())
      if (existsSync(directory) && readdirSync(directory).length === 0)
        rmdirSync(directory);
  } catch (error) {
    log(
      `✘ The previous compiler output could not be restored: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

function discardScratch(root: string): void {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    if (entry === APPROVAL_FILE) continue;
    rmSync(join(root, entry), { recursive: true, force: true });
  }
}

async function generate(
  request: GenerationRequest & {
    readonly scratchRoot: string;
    readonly outputTarget: string;
    readonly retainOutputs: (plan: CompilePlan) => void;
  },
  plan: CompilePlan,
): Promise<GenerationResult> {
  const { log } = request;
  const promoteOutput = request.promoteOutput !== false;
  const phases: GenerationPhase[] = [];
  const generationRoot = request.scratchRoot;
  const candidateRoot = join(generationRoot, "candidate");
  const typesRoot = join(generationRoot, "types");
  mkdirSync(typesRoot, { recursive: true });
  const emittedRoot = mkdtempSync(join(typesRoot, "loader-"));
  mkdirSync(candidateRoot, { recursive: true });

  const failure = (
    status: "invalid" | "failed",
    report?: DefinitionCheckReport,
  ): GenerationResult => ({
    status,
    exitCode: status === "invalid" ? 1 : 2,
    phases,
    report,
    compilerOutputs: plan.outputs,
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
  let typecheck: Awaited<ReturnType<GenerationSteps["typecheck"]>>;
  try {
    typecheck = await request.steps.typecheck({
      packageRoot: request.packageRoot,
      emittedRoot,
      plan,
      retainOutputs: request.retainOutputs,
    });
  } catch (error) {
    if (!(error instanceof CompilePreflightError)) throw error;
    return refusal(error.message);
  }
  if (!typecheck.ok) {
    log("✘ TypeScript failed; no definition was evaluated.\n");
    if (typecheck.summary !== undefined) {
      log(`${typecheck.summary}\n`);
      for (const hint of legacySubgraphHints(
        typecheck.summary,
        request.packageRoot,
      )) {
        log(`✘ ${hint}\n`);
      }
    }
    return failure("failed");
  }
  plan = typecheck.plan;
  if (typecheck.diagnostics) log(`${typecheck.diagnostics}\n`);
  try {
    const compilerOutputs = plan.outputs;
    const sources = [
      ...new Set(
        plan.projects
          .filter((project) => !project.external)
          .flatMap((project) => project.sources)
          .map((path) => canonicalPath(path)),
      ),
    ]
      .map((source) => toPosixPath(relative(request.packageRoot, source)))
      .sort();
    const compilerProjects =
      plan.preflightTypeError === undefined
        ? plan.projects.map((project) => project.configFile)
        : [];
    const compilerInputs = compilePlanInputs(
      plan.preflightTypeError === undefined ? plan.projects : [],
    );
    let loadedRuntimeFiles: readonly string[] = [];
    let stateInput: BuildStateInput = {
      packageRoot: request.packageRoot,
      outDir: request.outDir,
      compilerOutputs,
      sources,
      candidateRoot,
      publishedFiles: [],
      compilerInputs,
      loadedRuntimeFiles,
    };
    let state = captureBuildState(stateInput);

    const loader = new DefinitionSourceLoader(
      new BuildGraphTypeScriptSourceImportAdapter({
        packageRoot: request.packageRoot,
        emittedModules: typecheck.emittedModules,
        loaderDiagnostics: typecheck.loaderDiagnostics,
      }),
      { onSharedBase: reportSharedBase(log) },
    );

    const outputRoot = resolve(request.packageRoot, request.outDir);
    const assembleCandidate = async (
      subgraphNames: readonly string[],
    ): Promise<void> => {
      log("▶ Emitting candidate bundles\n");
      phases.push("candidate");
      const bundlesRoot = join(generationRoot, "bundles");
      mkdirSync(bundlesRoot, { recursive: true });
      const candidate = await request.steps.emitCandidate({
        packageRoot: request.packageRoot,
        candidateRoot: bundlesRoot,
        subgraphNames,
      });
      if (!candidate.ok) {
        throw new CandidateBundleError(
          candidate.summary ?? "the candidate bundle failed",
        );
      }
      relocateSourceMaps(bundlesRoot, outputRoot);
      if (existsSync(outputRoot)) {
        for (const entry of readdirSync(outputRoot)) {
          if (entry === "browser" || entry === "node") continue;
          cpSync(join(outputRoot, entry), join(candidateRoot, entry), {
            recursive: true,
            verbatimSymlinks: true,
          });
        }
      }
      cpSync(bundlesRoot, candidateRoot, {
        recursive: true,
        verbatimSymlinks: true,
      });
      state = { ...state, outputDigest: directoryDigest(candidateRoot) };
    };

    const promote = async (
      report?: DefinitionCheckReport,
    ): Promise<GenerationResult | undefined> => {
      const moved = movedCompilerDestination({
        ...plan,
        destinations: [
          ...plan.destinations,
          { configured: outputRoot, target: request.outputTarget },
        ],
      });
      if (moved !== undefined)
        return refusal(
          `The compiler destination ${JSON.stringify(moved)} no longer resolves where the build checked it; nothing was promoted.`,
          report,
        );
      const reason = changedBuildState(state, captureBuildState(stateInput));
      if (reason !== undefined)
        return refusal(
          `The package changed while it was being checked (${reason}); nothing was promoted.`,
          report,
        );
      if (!promoteOutput) return undefined;
      log("▶ Promoting the candidate\n");
      phases.push("promote");
      await request.steps.promote({
        packageRoot: request.packageRoot,
        candidateRoot,
        outDir: request.outDir,
      });
      return undefined;
    };

    const buildWithoutEvidence = async (): Promise<GenerationResult> => {
      try {
        await assembleCandidate([]);
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
          compilerOutputs: plan.outputs,
          typeErrorsAccepted: typecheck.typeErrorsAccepted,
        }
      );
    };

    const hasSubgraphs =
      subgraphEntrySpecifiers(request.packageRoot).length > 0;
    const allowMissingConfig =
      request.allowMissingConfig === true &&
      request.cliSources === undefined &&
      !existsSync(request.configFile);
    if (allowMissingConfig) {
      const unregistered = findCodeFirstDefinitions(request.packageRoot);
      if (unregistered.length > 0) {
        for (const definition of unregistered) {
          log(
            `✘ ${formatDefinitionDiagnostic(unregisteredDefinitionDiagnostic(definition, "schema-first"))}\n`,
          );
        }
        return failure("failed");
      }
      if (!hasSubgraphs) {
        log(NOTHING_CHECKED);
        return await buildWithoutEvidence();
      }
    }

    const resolution = loader.resolve({
      configFile: request.configFile,
      ...(request.cliSources !== undefined && {
        cliSources: request.cliSources,
      }),
      allowMissingConfig,
    });
    if (
      resolution.status === "skipped" &&
      !hasSubgraphs &&
      findUnregisteredDefinitions(resolution).length === 0
    ) {
      log(NOTHING_CHECKED);
      return await buildWithoutEvidence();
    }

    let report: DefinitionCheckReport;
    try {
      log("▶ Checking definitions\n");
      phases.push("definitions");
      report = await checkDefinitions({
        profile: "release",
        loader,
        packageRevision: state.packageRevision,
        configFile: request.configFile,
        ...(request.cliSources !== undefined && {
          cliSources: request.cliSources,
        }),
        allowMissingConfig,
        warningsAsErrors: request.warningsAsErrors,
        hostValidation: defaultHostValidationFor(request.packageRoot),
        releaseEvidence: {
          typecheck: () => typecheck,
          verifyPackedConsumers: async () => {
            const runtime = typecheck.loadedRuntimeFiles();
            loadedRuntimeFiles = runtime.files;
            stateInput = { ...stateInput, loadedRuntimeFiles };
            state = { ...state, loadedRuntimeFilesDigest: runtime.digest };
            const { subgraphs } = await loader.readSubgraphs({
              packageRoot: request.packageRoot,
              packageRevision: state.packageRevision,
            });
            await assembleCandidate(
              subgraphs.map(({ description }) => description.subgraphName),
            );
            log("▶ Verifying packed consumers\n");
            phases.push("packed");
            const publications: PublishedFileSet[] = [];
            const packed = await request.steps.verifyPackedConsumers({
              packageRoot: request.packageRoot,
              candidateRoot,
              outDir: request.outDir,
              recordPublishedFiles: (publication) =>
                publications.push(publication),
            });
            if (packed.ok) {
              const publication = publications.at(0);
              const publishedFiles =
                publication?.files ?? listPublishedFiles(request.packageRoot);
              stateInput = { ...stateInput, publishedFiles };
              state = {
                ...state,
                publishedSetDigest:
                  publication?.digest ??
                  publishedFileSetDigest(
                    request.packageRoot,
                    request.outDir,
                    publishedFiles,
                  ),
              };
            }
            return packed;
          },
        },
      });
    } catch (error) {
      if (!(error instanceof CandidateBundleError)) throw error;
      return refusal(`The candidate bundle failed.\n${error.message}`);
    } finally {
      await loader.dispose();
    }

    if (report.status === "skipped") {
      log(NOTHING_CHECKED);
      return await buildWithoutEvidence();
    }
    if (report.status !== "ok") {
      log(`✘ ${report.status}\n`);
      return failure(
        report.status === "invalid" ? "invalid" : "failed",
        report,
      );
    }

    const approval: ReleaseApproval = {
      ...state,
      retainedDigest: state.outputDigest,
      kind: "powerhouse.release-approval",
      formatVersion: APPROVAL_FORMAT_VERSION,
      compilerProjects,
      compilerInputs,
      loadedRuntimeFiles,
      sourceSetDigest: report.sourceSet.digest,
      sources,
      compilerVersion: getVersion(),
      compilerOutputs,
      warningsAsErrors: request.warningsAsErrors,
      report,
    };

    const refused = await promote(report);
    if (refused !== undefined) return refused;
    if (promoteOutput) {
      if (
        changedBuildState(
          approval,
          captureBuildState({ ...stateInput, candidateRoot: outputRoot }),
        ) !== undefined
      ) {
        return refusal(
          "The published output differs from the verified candidate.",
          report,
        );
      }
      if (!typecheck.typeErrorsAccepted)
        writeFileSync(
          approvalPath(request.packageRoot),
          JSON.stringify(approval),
        );
    }

    return {
      status: "ok",
      exitCode: exitCodeFor(report),
      phases,
      report,
      compilerOutputs: plan.outputs,
      typeErrorsAccepted: typecheck.typeErrorsAccepted,
    };
  } finally {
    typecheck.disposeLoader?.();
  }
}
