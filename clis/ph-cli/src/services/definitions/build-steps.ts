import {
  browserEntry,
  buildBrowserBuildConfig,
  buildNodeBuildConfig,
  findBundledSharedDeps,
} from "@powerhousedao/shared/build-config";
import {
  buildPieces,
  expandEntryGlobs,
  pieceListPath,
  planPieces,
  syncDistManifest,
} from "@powerhousedao/shared/build-pieces";
import {
  EXTERNALIZABLE_SHARED_SPECIFIERS,
  findSharedImports,
} from "@powerhousedao/shared/connect";
import { readPackage } from "read-pkg";
import { z } from "zod";
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
import { dirname, join, resolve } from "node:path";
import type { Agent } from "package-manager-detector";
import { detect, resolveCommand } from "package-manager-detector";
import {
  assertOutputDirectory,
  type CandidateRequest,
  directoryDigest,
  GENERATION_DIRECTORY,
  type GenerationSteps,
  pathWithin,
} from "./generation.js";
import { NON_INPUT_DIRECTORIES } from "./package-revision.js";

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
    const stdout = await spawnAsync(resolved.command, resolved.args, {
      cwd: packageRoot,
    });
    return { ok: true, stdout };
  } catch (error) {
    return {
      ok: false,
      summary: error instanceof Error ? error.message : `${argv[0]} failed`,
    };
  }
}

type BuildStepOptions = {
  readonly ignoreTypeErrors?: boolean;
  readonly noSharedDeps?: boolean;
};

const compilerConfigSchema = z.object({
  compilerOptions: z.object({
    declarationDir: z.string().optional(),
    outDir: z.string().optional(),
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

export function createTypecheckStep(
  agent: Agent,
  outDir: string,
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
    const result = !referencesBuilt.ok
      ? referencesBuilt
      : await runLocal(packageRoot, agent, [
          "tsc",
          "-p",
          "tsconfig.json",
          "--outDir",
          emittedRoot,
          "--declaration",
          "--declarationDir",
          emittedRoot,
          "--emitDeclarationOnly",
          "false",
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
      const { compilerOptions } = compilerConfig;
      const declared = compilerOptions.declarationDir ?? compilerOptions.outDir;
      const emittedModules = new Map<string, string>();
      for (const path of filesUnder(emittedRoot)) {
        if (!/\.[cm]?jsx?\.map$/.test(path)) continue;
        const map = sourceMapSchema.parse(
          JSON.parse(readFileSync(path, "utf8")),
        );
        for (const source of map.sources) {
          emittedModules.set(
            resolve(dirname(path), map.sourceRoot ?? "", source),
            path.slice(0, -4),
          );
        }
      }
      return {
        ok: true,
        emittedModules,
        declarationSubdirectory:
          declared === undefined
            ? null
            : pathWithin(
                join(packageRoot, outDir),
                resolve(packageRoot, declared),
              ),
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
      await build({
        ...buildBrowserBuildConfig({ sharedDeps: !options.noSharedDeps }),
        cwd: packageRoot,
        copy,
        outDir: join(candidateRoot, "browser"),
      });
      await build({
        ...buildNodeBuildConfig({ sharedDeps: !options.noSharedDeps }),
        cwd: packageRoot,
        copy,
        outDir: join(candidateRoot, "node"),
      });
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
        const pkg = await readPackage({ cwd: packageRoot });
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
          { bundle: (config) => build({ ...config, cwd: packageRoot }) },
        );
      }
      syncDistManifest(target, built);
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
  outDir: string,
  options: BuildStepOptions = {},
): Promise<GenerationSteps> {
  const detected = await detect();
  const agent = detected?.agent ?? "npm";
  return {
    typecheck: createTypecheckStep(agent, outDir, options),
    emitCandidate: createCandidateStep(agent, options),
    verifyPackedConsumers,
    promote: promoteCandidate,
  };
}
