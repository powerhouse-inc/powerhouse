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
import { z } from "zod";
import { SpawnError, spawnAsync } from "@powerhousedao/shared/clis";
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
import { dirname, isAbsolute, join, resolve } from "node:path";
import { nodeFileTrace } from "@vercel/nft";
import type { Agent } from "package-manager-detector";
import { detect, resolveCommand } from "package-manager-detector";
import {
  assertOutputDirectory,
  type CandidateRequest,
  directoryDigest,
  GENERATION_DIRECTORY,
  type GenerationSteps,
} from "./generation.js";
import { NON_INPUT_DIRECTORIES } from "./package-revision.js";
import { canonicalPath } from "./paths.js";

// nft reports paths relative to its base; from "/" that is every path minus its root.
// One cache per build: the traces of a project's packages share most files.
export function createTraceFiles(): TraceFiles {
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
export function assertExternalDependenciesDeclared(
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

type CommandResult = {
  readonly ok: boolean;
  readonly summary?: string;
  readonly stdout?: string;
};

async function runLocal(
  packageRoot: string,
  agent: Agent,
  argv: readonly string[],
): Promise<CommandResult> {
  const resolved = resolveCommand(agent, "execute-local", [...argv]);
  if (resolved === null) {
    return {
      ok: false,
      summary: `${argv[0]} is not installed in this package`,
    };
  }
  try {
    // tsc spells paths from $PWD when it names the same directory, so a
    // shell in a symlinked spelling of the package would change every path.
    const stdout = await spawnAsync(resolved.command, resolved.args, {
      cwd: packageRoot,
      env: { ...process.env, PWD: packageRoot },
    });
    return { ok: true, stdout };
  } catch (error) {
    return {
      ok: false,
      summary: error instanceof Error ? error.message : `${argv[0]} failed`,
      ...(error instanceof SpawnError && { stdout: error.stdout }),
    };
  }
}

type BuildStepOptions = {
  readonly ignoreTypeErrors?: boolean;
  readonly noSharedDeps?: boolean;
};

const compilerConfigSchema = z.object({
  compilerOptions: z.object({
    declaration: z.boolean().optional(),
    composite: z.boolean().optional(),
    declarationDir: z.string().optional(),
    outDir: z.string().optional(),
    rootDir: z.string().optional(),
    noEmit: z.boolean().optional(),
    allowImportingTsExtensions: z.boolean().optional(),
  }),
  references: z.array(z.object({ path: z.string() })).optional(),
});
const sourceMapSchema = z.object({
  sources: z.array(z.string()),
  sourceRoot: z.string().optional(),
});

function filesUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory()
      ? filesUnder(path)
      : entry.isFile()
        ? [path]
        : [];
  });
}

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

type CompilerOptions = z.infer<typeof compilerConfigSchema>["compilerOptions"];

// The redirected emit must lay declarations out under emittedRoot exactly as
// tsc lays them out under the returned directory.
export function declarationLayout(
  compilerOptions: CompilerOptions,
  packageRoot: string,
  emittedRoot: string,
): { readonly flags: readonly string[]; readonly directory: string | null } {
  const declares =
    compilerOptions.declaration === true || compilerOptions.composite === true;
  const emits = compilerOptions.noEmit !== true;
  // With no outDir or declarationDir tsc writes each declaration beside its
  // source; the redirected emit is laid out from rootDir, so mapping back
  // through it, or the package root when unset, lands beside the source.
  // Under noEmit tsc writes nothing, so pinning the layout moves no file;
  // under emit an unset rootDir is left to tsc, which reports TS5011 as on
  // main.
  const layoutRoot =
    compilerOptions.declarationDir ??
    compilerOptions.outDir ??
    compilerOptions.rootDir;
  const pinsLayout =
    compilerOptions.rootDir === undefined &&
    (layoutRoot === undefined || !emits);
  return {
    flags: [
      // tsc rejects emitDeclarationOnly without declarations (TS5069), as on
      // main, so it is only lifted when declarations are on.
      ...(declares
        ? ["--declarationDir", emittedRoot, "--emitDeclarationOnly", "false"]
        : []),
      ...(pinsLayout ? ["--rootDir", packageRoot] : []),
    ],
    directory:
      declares && emits ? resolve(packageRoot, layoutRoot ?? ".") : null,
  };
}

// The paths `tsc --listFilesOnly --pretty false` prints, as tsc spells them;
// its diagnostics are relative and drop out.
function listedFiles(stdout: string | undefined): string[] {
  return (stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => isAbsolute(line) && existsSync(line))
    .map((file) => resolve(file));
}

export function createTypecheckStep(
  agent: Agent,
  options: BuildStepOptions = {},
): GenerationSteps["typecheck"] {
  return async ({ packageRoot, emittedRoot }) => {
    const config = await runLocal(packageRoot, agent, [
      "tsc",
      "-p",
      "tsconfig.json",
      "--showConfig",
    ]);
    if (!config.ok) return { ok: false, summary: config.summary };
    let compilerConfig: z.infer<typeof compilerConfigSchema>;
    try {
      compilerConfig = compilerConfigSchema.parse(
        JSON.parse(config.stdout ?? ""),
      );
    } catch (error) {
      return { ok: false, summary: layoutFailure(error) };
    }
    const layout = declarationLayout(
      compilerConfig.compilerOptions,
      packageRoot,
      emittedRoot,
    );
    // `tsc -p` reads a referenced project's declarations without building
    // them, so the references build first, as `tsc --build` would.
    const references = compilerConfig.references ?? [];
    const referencesBuilt =
      references.length === 0
        ? { ok: true }
        : await runLocal(packageRoot, agent, [
            "tsc",
            "--build",
            ...references.map((reference) => reference.path),
          ]);
    // The redirected emit cannot see a declaration overwrite an input, so
    // the program main would build is listed for the plan to check against.
    // tsc prints the list even when it reports errors.
    const listed =
      !referencesBuilt.ok || layout.directory === null
        ? undefined
        : await runLocal(packageRoot, agent, [
            "tsc",
            "-p",
            "tsconfig.json",
            "--listFilesOnly",
            "--pretty",
            "false",
          ]);
    const programFiles = listedFiles(listed?.stdout);
    // A program can list nothing (a solution tsconfig with only
    // references); a listing that failed and printed nothing cannot be
    // trusted.
    if (listed !== undefined && !listed.ok && programFiles.length === 0) {
      return {
        ok: false,
        refused: true,
        summary: `tsc listed no program files, so the declarations cannot be checked against its inputs: ${listed.summary}`,
      };
    }
    const result = !referencesBuilt.ok
      ? referencesBuilt
      : await runLocal(packageRoot, agent, [
          "tsc",
          "-p",
          "tsconfig.json",
          "--outDir",
          emittedRoot,
          ...layout.flags,
          "--noEmit",
          "false",
          "--noEmitOnError",
          "false",
          "--sourceMap",
          "true",
          "--inlineSourceMap",
          "false",
          "--tsBuildInfoFile",
          join(emittedRoot, "tsconfig.tsbuildinfo"),
          // Emitting JS is only allowed with `.ts` imports when they are
          // rewritten, and Node needs them rewritten to load the output.
          ...(compilerConfig.compilerOptions.allowImportingTsExtensions
            ? ["--rewriteRelativeImportExtensions", "true"]
            : []),
        ]);
    if (!result.ok) {
      console.error(result.summary);
      if (
        !options.ignoreTypeErrors &&
        !(await confirmBuildDespiteTypeErrors())
      ) {
        return { ok: false, summary: result.summary };
      }
      console.warn(
        "⚠ Building despite type errors. The package can load and still fail at runtime. Fix them before you publish or deploy it.",
      );
    }
    try {
      const emittedModules = new Map<string, string>();
      for (const path of filesUnder(emittedRoot)) {
        if (!/\.[cm]?jsx?\.map$/.test(path)) continue;
        const map = sourceMapSchema.parse(
          JSON.parse(readFileSync(path, "utf8")),
        );
        for (const source of map.sources) {
          emittedModules.set(
            canonicalPath(resolve(dirname(path), map.sourceRoot ?? "", source)),
            canonicalPath(path.slice(0, -4)),
          );
        }
      }
      return {
        ok: true,
        emittedModules,
        declarationDirectory: layout.directory,
        inputs: programFiles.filter((file) => /\.d\.[cm]?ts$/.test(file)),
      };
    } catch (error) {
      return { ok: false, summary: layoutFailure(error) };
    }
  };
}

function layoutFailure(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The TypeScript output layout could not be resolved.";
}

function createCandidateStep(
  agent: Agent,
  options: BuildStepOptions,
): GenerationSteps["emitCandidate"] {
  return async ({ packageRoot, candidateRoot }) => {
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
          filesUnder(join(candidateRoot, "browser"))
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
      syncDistManifest(
        target,
        built,
        externalDependencyVersions(external.values()),
      );
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
      if (!css.ok) return css;
    }
    return { ok: true };
  };
}

export async function verifyPackedConsumers({
  packageRoot,
  candidateRoot,
  outDir,
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

  const generationRoot = join(packageRoot, GENERATION_DIRECTORY);
  const packRoot = join(generationRoot, "pack");
  const tarballRoot = join(generationRoot, "tarball");
  const consumerRoot = join(generationRoot, "consumer");
  const installed = join(consumerRoot, "node_modules", name);
  try {
    for (const directory of [packRoot, tarballRoot, consumerRoot]) {
      rmSync(directory, { recursive: true, force: true });
      mkdirSync(directory, { recursive: true });
    }
    for (const entry of readdirSync(packageRoot)) {
      if (NON_INPUT_DIRECTORIES.includes(entry)) continue;
      cpSync(join(packageRoot, entry), join(packRoot, entry), {
        recursive: true,
      });
    }
    assertOutputDirectory(packRoot, outDir);
    rmSync(join(packRoot, outDir), { recursive: true, force: true });
    cpSync(candidateRoot, join(packRoot, outDir), { recursive: true });

    await spawnAsync(
      "npm",
      ["pack", "--ignore-scripts", "--pack-destination", tarballRoot],
      { cwd: packRoot },
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
  return failures.length === 0
    ? { ok: true, consumers }
    : { ok: false, consumers, summary: failures.join("\n") };
}

export function promoteCandidate({
  packageRoot,
  candidateRoot,
  outDir,
}: CandidateRequest): Promise<void> {
  assertOutputDirectory(packageRoot, outDir);
  const target = resolve(packageRoot, outDir);
  mkdirSync(dirname(target), { recursive: true });
  const staged = mkdtempSync(`${target}.promote-`);
  const previous = `${staged}.previous`;
  try {
    cpSync(candidateRoot, staged, { recursive: true });
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
    typecheck: createTypecheckStep(agent, options),
    emitCandidate: createCandidateStep(agent, options),
    verifyPackedConsumers,
    promote: promoteCandidate,
  };
}
