import {
  browserEntry,
  buildBrowserBuildConfig,
  buildNodeBuildConfig,
  findBundledSharedDeps,
} from "@powerhousedao/shared/build-config";
import type {
  ExternalDependency,
  TraceFiles,
} from "@powerhousedao/shared/build-pieces";
import {
  buildPieces,
  createDetectionCache,
  expandEntryGlobs,
  externalDependencyVersions,
  externalDepsPlugin,
  pieceListPath,
  planPieces,
  projectPath,
  syncDistManifest,
  undeclaredExternalDependencies,
} from "@powerhousedao/shared/build-pieces";
import {
  EXTERNALIZABLE_SHARED_SPECIFIERS,
  findSharedImports,
} from "@powerhousedao/shared/connect";
import { readPackage } from "read-pkg";
import { spawnAsync } from "@powerhousedao/shared/clis";
import type { PackedConsumerEvidence } from "document-model/tooling";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { nodeFileTrace } from "@vercel/nft";
import type { Agent } from "package-manager-detector";
import { detect } from "package-manager-detector";
import {
  assertOutputDirectory,
  type CandidateRequest,
  type GenerationSteps,
} from "./generation.js";
import { directoryDigest, fileEntriesDigest } from "./package-revision.js";
import { copyPackageForPack } from "./package-copy.js";
import { packedFileList, publishedFileSetDigest } from "./published-files.js";
import { walkFiles } from "./file-walk.js";
import {
  hasMissingCompileOutputs,
  prepareCompile,
  refreshCompileGraph,
  runLocal,
} from "./compiler.js";
import { emitLoaderModules } from "./loader-modules.js";
import { canonicalPath, scratchDirectory } from "./paths.js";

// nft reports paths relative to its base; from "/" that is every path minus its root.
// One cache per build: the traces of a project's packages share most files.
function createTraceFiles(): TraceFiles {
  const cache = {};
  return (file) => traceFile(file, cache);
}

export const traceFiles: TraceFiles = createTraceFiles();

async function traceFile(file: string, cache: object) {
  const { fileList, reasons } = await nodeFileTrace([file], {
    base: "/",
    cache,
  });
  const absolute = (p: string) => resolve("/", p);
  return {
    fileList: new Set([...fileList].map(absolute)),
    reasons: new Map(
      [...reasons].map(([p, reason]) => [
        absolute(p),
        { parents: new Set([...reason.parents].map(absolute)) },
      ]),
    ),
  };
}

// A package with a native addon or WebAssembly module stays external, so the
// package's consumers must install it: devDependencies are skipped by every install.
function assertExternalDependenciesDeclared(
  projectRoot: string,
  found: ExternalDependency[],
  pkg: Parameters<typeof undeclaredExternalDependencies>[1],
) {
  for (const dep of found) {
    console.log(
      `${dep.name}@${dep.version} stays external, it needs ${projectPath(projectRoot, dep.file)}`,
    );
  }
  const undeclared = undeclaredExternalDependencies(found, pkg);
  if (undeclared.length === 0) return;
  const lines = undeclared.map(
    (dep) =>
      `  ${dep.name}${dep.importer ? ` (imported by ${projectPath(projectRoot, dep.importer)})` : ""}`,
  );
  throw new Error(
    `Packages with native addons or WebAssembly modules must be listed in package.json "dependencies", "optionalDependencies" or "peerDependencies":\n` +
      `${lines.join("\n")}\n\n` +
      `They stay external to the build, and installs of this package skip devDependencies.`,
  );
}

type BuildStepOptions = {
  readonly ignoreTypeErrors?: boolean;
  readonly noSharedDeps?: boolean;
};

async function confirmBuildDespiteTypeErrors(): Promise<boolean> {
  if (!process.stdin.isTTY || process.env.CI) {
    console.error(
      "Fix the type errors and build again, or use --ignore-type-errors to build without asking.",
    );
    return false;
  }
  const enquirer = await import("enquirer");
  try {
    const answer = await enquirer.default.prompt<{ confirmed: boolean }>({
      type: "confirm",
      name: "confirmed",
      message:
        "tsc reported type errors. A package built with type errors can load and still fail at runtime. Build anyway?",
      initial: false,
    });
    return answer.confirmed;
  } catch {
    return false;
  }
}

export function createTypecheckStep(
  agent: Agent,
  options: BuildStepOptions = {},
): GenerationSteps["typecheck"] {
  return async ({ packageRoot, emittedRoot, plan }) => {
    const projects = new Map(
      plan.projects.map((project) => [project.configFile, project]),
    );
    const visited = new Set<string>();
    const references: string[] = [];
    const visit = (configFile: string): void => {
      if (visited.has(configFile)) return;
      visited.add(configFile);
      for (const reference of projects.get(configFile)?.references ?? [])
        visit(reference);
      if (configFile !== plan.projects[0].configFile)
        references.push(configFile);
    };
    visit(plan.projects[0].configFile);
    const acceptTypeErrors = async (
      result: Awaited<ReturnType<typeof runLocal>>,
    ): Promise<boolean> => {
      if (result.ok) return true;
      console.error(result.output);
      if (!options.ignoreTypeErrors && !(await confirmBuildDespiteTypeErrors()))
        return false;
      console.warn(
        "⚠ Building despite type errors. The package can load and still fail at runtime. Fix them before you publish or deploy it.",
      );
      return true;
    };
    if (plan.preflightTypeError !== undefined) {
      const preflightTypeError = plan.preflightTypeError;
      if (plan.projects[0].diagnostic !== undefined)
        plan = await refreshCompileGraph(
          packageRoot,
          agent,
          plan,
          plan.projects[0].configFile,
        );
      const result = await runLocal(packageRoot, agent, [
        "tsc",
        "--build",
        ...(hasMissingCompileOutputs(plan) ? ["--force"] : []),
      ]);
      if (!(await acceptTypeErrors(result)))
        return { ok: false, summary: result.output };
      return {
        ok: true,
        emittedModules: new Map(),
        loadedRuntimeFiles: () => ({
          files: [],
          digest: fileEntriesDigest([]),
        }),
        loaderDiagnostics: preflightTypeError,
        diagnostics: result.output,
        plan,
      };
    }
    for (const reference of references) {
      plan = await refreshCompileGraph(packageRoot, agent, plan, reference);
      const built = await runLocal(packageRoot, agent, [
        "tsc",
        "--build",
        reference,
        ...(hasMissingCompileOutputs(plan, reference) ? ["--force"] : []),
      ]);
      if (!(await acceptTypeErrors(built)))
        return { ok: false, summary: built.output };
    }
    plan = await refreshCompileGraph(
      packageRoot,
      agent,
      plan,
      plan.projects[0].configFile,
    );
    const result = await runLocal(packageRoot, agent, [
      "tsc",
      "--build",
      ...(hasMissingCompileOutputs(plan) ? ["--force"] : []),
    ]);
    if (!(await acceptTypeErrors(result)))
      return { ok: false, summary: result.output };
    const loader = await emitLoaderModules(
      packageRoot,
      agent,
      emittedRoot,
      plan,
    );
    return {
      ok: true,
      emittedModules: loader.modules,
      loaderDiagnostics: loader.diagnostics,
      loadedRuntimeFiles: loader.loadedRuntimeFiles,
      disposeLoader: loader.dispose,
      plan,
    };
  };
}

function createCandidateStep(
  agent: Agent,
  options: BuildStepOptions,
): GenerationSteps["emitCandidate"] {
  return async ({ packageRoot, candidateRoot, subgraphNames }) => {
    const { build } = await import("tsdown");
    const copy = existsSync(join(packageRoot, "powerhouse.manifest.json"))
      ? [{ from: "powerhouse.manifest.json", to: candidateRoot }]
      : [];
    try {
      // Shared by the browser, node and piece builds: nothing is traced twice.
      const detection = createDetectionCache();
      const trace = createTraceFiles();
      // Everything in the browser build is code Connect can load: native fails it.
      await build({
        ...buildBrowserBuildConfig({
          sharedDeps: !options.noSharedDeps,
          plugins: [
            externalDepsPlugin(trace, new Map(), {
              root: packageRoot,
              browser: true,
              cache: detection,
            }),
          ],
        }),
        cwd: packageRoot,
        copy,
        outDir: join(candidateRoot, "browser"),
      });
      const external = new Map<string, ExternalDependency>();
      await build({
        ...buildNodeBuildConfig({
          sharedDeps: !options.noSharedDeps,
          plugins: [
            // Editors never run on a host; document models run in Connect too.
            externalDepsPlugin(trace, external, {
              root: packageRoot,
              ignoreDirs: ["editors"],
              forbidDirs: ["document-models"],
              cache: detection,
            }),
          ],
        }),
        cwd: packageRoot,
        copy,
        outDir: join(candidateRoot, "node"),
      });
      const pkg = await readPackage({ cwd: packageRoot });
      assertExternalDependenciesDeclared(
        packageRoot,
        [...external.values()],
        pkg,
      );
      if (!options.noSharedDeps) {
        const imported = [
          ...new Set(
            expandEntryGlobs(packageRoot, browserEntry).flatMap((file) =>
              findSharedImports(
                readFileSync(file, "utf8"),
                EXTERNALIZABLE_SHARED_SPECIFIERS,
              ),
            ),
          ),
        ];
        const bundled = findBundledSharedDeps(
          imported,
          walkFiles(join(candidateRoot, "browser"))
            .filter((file) => file.endsWith(".js"))
            .map((file) => ({
              path: file,
              content: readFileSync(file, "utf8"),
            })),
        );
        if (bundled.length > 0)
          console.warn(
            `⚠ shared deps bundled instead of externalized: ${bundled.join(", ")} — check your neverBundle config`,
          );
      }
      const target = {
        projectRoot: packageRoot,
        outDir: candidateRoot,
        pieces: [],
      };
      let built: Awaited<ReturnType<typeof buildPieces>> = [];
      if (existsSync(pieceListPath(target))) {
        const stageRoot = join(dirname(candidateRoot), "piece-package");
        mkdirSync(stageRoot, { recursive: true });
        symlinkSync(
          candidateRoot,
          join(stageRoot, "dist"),
          process.platform === "win32" ? "junction" : "dir",
        );
        built = await buildPieces(
          {
            projectRoot: stageRoot,
            outDir: "dist",
            pieces: planPieces(packageRoot, "dist").map((piece) => ({
              ...piece,
              entry: resolve(packageRoot, piece.entry),
            })),
          },
          {
            name: pkg.name,
            version: pkg.version,
            license: typeof pkg.license === "string" ? pkg.license : undefined,
          },
          {
            bundle: (config) => build({ ...config, cwd: packageRoot }),
            trace,
            cache: detection,
          },
        );
      }
      syncDistManifest(target, {
        built,
        externalDependencies: externalDependencyVersions(external.values()),
        subgraphNames,
      });
    } catch (error) {
      return {
        ok: false,
        summary: error instanceof Error ? error.message : "the bundle failed",
      };
    }
    if (existsSync(join(packageRoot, "style.css"))) {
      const css = await runLocal(packageRoot, agent, [
        "tailwindcss",
        "-i",
        "./style.css",
        "-o",
        join(candidateRoot, "style.css"),
      ]);
      if (!css.ok) return { ok: false, summary: css.output };
    }
    return { ok: true };
  };
}

export async function verifyPackedConsumers({
  packageRoot,
  candidateRoot,
  outDir,
  recordPublishedFiles,
}: CandidateRequest): Promise<PackedConsumerEvidence> {
  const failed = (summary: string): PackedConsumerEvidence => ({
    ok: false,
    consumers: [],
    summary,
  });
  let name: unknown;
  try {
    name = (
      JSON.parse(
        readFileSync(join(packageRoot, "package.json"), "utf-8"),
      ) as Record<string, unknown>
    ).name;
  } catch {
    return failed("the package manifest could not be read");
  }
  if (typeof name !== "string" || name === "") {
    return failed("the package has no name, so no consumer can import it");
  }

  const generationRoot = scratchDirectory(packageRoot);
  const packRoot = join(generationRoot, "pack");
  const tarballRoot = join(generationRoot, "tarball");
  const consumerRoot = join(generationRoot, "consumer");
  const installed = join(consumerRoot, "node_modules", name);
  let publishedFiles: readonly string[];
  let publishedSetDigest: string;
  try {
    for (const directory of [packRoot, tarballRoot, consumerRoot]) {
      rmSync(directory, { recursive: true, force: true });
      mkdirSync(directory, { recursive: true });
    }
    const output = canonicalPath(resolve(packageRoot, outDir));
    copyPackageForPack(packageRoot, packRoot, [output]);
    const stagedOutput = resolve(packRoot, relative(packageRoot, output));
    assertOutputDirectory(packRoot, relative(packageRoot, output));
    mkdirSync(stagedOutput, { recursive: true });
    cpSync(candidateRoot, stagedOutput, {
      recursive: true,
      verbatimSymlinks: true,
    });

    const packed = await spawnAsync(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", tarballRoot],
      { cwd: packRoot },
    );
    publishedFiles = packedFileList(packed);
    publishedSetDigest = publishedFileSetDigest(
      packageRoot,
      outDir,
      publishedFiles,
      packRoot,
    );
    const produced = readdirSync(tarballRoot).filter((entry) =>
      entry.endsWith(".tgz"),
    );
    if (produced.length !== 1) {
      return failed(`packing produced ${String(produced.length)} tarballs`);
    }
    mkdirSync(installed, { recursive: true });
    await spawnAsync("tar", [
      "-xzf",
      join(tarballRoot, produced[0]),
      "--strip-components=1",
      "-C",
      installed,
    ]);
    if (existsSync(join(packageRoot, "node_modules"))) {
      for (const entry of readdirSync(join(packageRoot, "node_modules"))) {
        const target = join(consumerRoot, "node_modules", entry);
        if (existsSync(target)) continue;
        symlinkSync(
          join(packageRoot, "node_modules", entry),
          target,
          process.platform === "win32" ? "junction" : undefined,
        );
      }
    }
    writeFileSync(join(consumerRoot, "package.json"), '{"type":"module"}\n');
  } catch (error) {
    return failed(
      error instanceof Error ? error.message : "the candidate would not pack",
    );
  }

  const consumers: string[] = [];
  const failures: string[] = [];
  for (const [consumer, conditions] of [
    ["node", []],
    ["browser", ["--conditions", "browser"]],
  ] as const) {
    consumers.push(consumer);
    try {
      await spawnAsync(
        process.execPath,
        [
          ...conditions,
          "--input-type=module",
          "-e",
          `await import(${JSON.stringify(name)});`,
        ],
        { cwd: consumerRoot },
      );
    } catch (error) {
      failures.push(
        `${consumer}: ${error instanceof Error ? error.message : "import failed"}`,
      );
    }
  }
  if (failures.length !== 0)
    return { ok: false, consumers, summary: failures.join("\n") };
  recordPublishedFiles?.({ files: publishedFiles, digest: publishedSetDigest });
  return { ok: true, consumers };
}

export function promoteCandidate({
  packageRoot,
  candidateRoot,
  outDir,
}: CandidateRequest): Promise<void> {
  const target = canonicalPath(resolve(packageRoot, outDir));
  mkdirSync(dirname(target), { recursive: true });
  const staged = mkdtempSync(`${target}.promote-`);
  const previous = `${staged}.previous`;
  try {
    cpSync(candidateRoot, staged, { recursive: true, verbatimSymlinks: true });
    if (directoryDigest(staged) !== directoryDigest(candidateRoot)) {
      throw new Error("The copied output differs from the verified candidate.");
    }
    if (existsSync(target)) renameSync(target, previous);
    renameSync(staged, target);
  } catch (error) {
    if (existsSync(previous) && !existsSync(target)) {
      renameSync(previous, target);
    }
    throw error;
  } finally {
    rmSync(staged, { recursive: true, force: true });
    rmSync(previous, { recursive: true, force: true });
  }
  return Promise.resolve();
}

export async function createGenerationSteps(
  options: BuildStepOptions = {},
): Promise<GenerationSteps> {
  const detected = await detect();
  const agent = detected?.agent ?? "npm";
  return {
    preflight: (packageRoot, loadDefinitions) =>
      prepareCompile(packageRoot, agent, loadDefinitions),
    typecheck: createTypecheckStep(agent, options),
    emitCandidate: createCandidateStep(agent, options),
    verifyPackedConsumers,
    promote: promoteCandidate,
  };
}
