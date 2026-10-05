import {
  browserBuildConfig,
  nodeBuildConfig,
} from "@powerhousedao/shared/build-config";
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
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type { Agent } from "package-manager-detector";
import { detect, resolveCommand } from "package-manager-detector";
import type * as TypeScript from "typescript";
import {
  assertOutputDirectory,
  type CandidateRequest,
  directoryDigest,
  GENERATION_DIRECTORY,
  type GenerationSteps,
  pathWithin,
} from "./generation.js";
import { NON_INPUT_DIRECTORIES } from "./package-revision.js";

type CommandResult = { readonly ok: boolean; readonly summary?: string };

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
    await spawnAsync(resolved.command, resolved.args, { cwd: packageRoot });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      summary: error instanceof Error ? error.message : `${argv[0]} failed`,
    };
  }
}

const tsConfigHost = (ts: typeof TypeScript) => ({
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: () => undefined,
});

function publishedDeclarationSubdirectory(
  ts: typeof TypeScript,
  packageRoot: string,
  outDir: string,
): string | null {
  const options = ts.getParsedCommandLineOfConfigFile(
    join(packageRoot, "tsconfig.json"),
    undefined,
    tsConfigHost(ts),
  )?.options;
  const declared = options?.declarationDir ?? options?.outDir;
  if (declared === undefined) return null;
  return pathWithin(join(packageRoot, outDir), resolve(packageRoot, declared));
}

export function createTypecheckStep(
  agent: Agent,
  outDir: string,
): GenerationSteps["typecheck"] {
  return async ({ packageRoot, emittedRoot }) => {
    const result = await runLocal(packageRoot, agent, [
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
      "--tsBuildInfoFile",
      join(emittedRoot, "tsconfig.tsbuildinfo"),
    ]);
    if (!result.ok) return { ok: false, summary: result.summary };
    try {
      const ts = createRequire(join(packageRoot, "package.json"))(
        "typescript",
      ) as typeof TypeScript;
      const parsed = ts.getParsedCommandLineOfConfigFile(
        join(packageRoot, "tsconfig.json"),
        {
          outDir: emittedRoot,
          declaration: true,
          declarationDir: emittedRoot,
          emitDeclarationOnly: false,
          noEmit: false,
          tsBuildInfoFile: join(emittedRoot, "tsconfig.tsbuildinfo"),
        },
        tsConfigHost(ts),
      );
      if (parsed === undefined || parsed.errors.length > 0) {
        return {
          ok: false,
          summary: "The TypeScript output layout could not be resolved.",
        };
      }
      const program = ts.createProgram({
        rootNames: parsed.fileNames,
        options: parsed.options,
        projectReferences: parsed.projectReferences,
      });
      const emittedConfig = {
        ...parsed,
        fileNames: program
          .getSourceFiles()
          .filter(
            (file) =>
              !file.isDeclarationFile &&
              !program.isSourceFileFromExternalLibrary(file),
          )
          .map((file) => file.fileName),
      };
      const emittedModules = new Map<string, string>();
      for (const source of emittedConfig.fileNames) {
        const emitted = ts
          .getOutputFileNames(
            emittedConfig,
            source,
            !ts.sys.useCaseSensitiveFileNames,
          )
          .find((file) => /\.[cm]?jsx?$/.test(file));
        if (emitted !== undefined)
          emittedModules.set(resolve(source), resolve(emitted));
      }
      return {
        ok: true,
        emittedModules,
        declarationSubdirectory: publishedDeclarationSubdirectory(
          ts,
          packageRoot,
          outDir,
        ),
      };
    } catch (error) {
      return {
        ok: false,
        summary:
          error instanceof Error
            ? error.message
            : "The TypeScript output layout could not be resolved.",
      };
    }
  };
}

function createCandidateStep(agent: Agent): GenerationSteps["emitCandidate"] {
  return async ({ packageRoot, candidateRoot }) => {
    const { build } = await import("tsdown");
    const copy = existsSync(join(packageRoot, "powerhouse.manifest.json"))
      ? [{ from: "powerhouse.manifest.json", to: candidateRoot }]
      : [];
    try {
      await build({
        ...browserBuildConfig,
        cwd: packageRoot,
        copy,
        outDir: join(candidateRoot, "browser"),
      });
      await build({
        ...nodeBuildConfig,
        cwd: packageRoot,
        copy,
        outDir: join(candidateRoot, "node"),
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
): Promise<GenerationSteps> {
  const detected = await detect();
  const agent = detected?.agent ?? "npm";
  return {
    typecheck: createTypecheckStep(agent, outDir),
    emitCandidate: createCandidateStep(agent),
    verifyPackedConsumers,
    promote: promoteCandidate,
  };
}
