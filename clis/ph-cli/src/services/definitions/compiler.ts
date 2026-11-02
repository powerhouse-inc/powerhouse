import { SpawnError, spawnAsync } from "@powerhousedao/shared/clis";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { Agent } from "package-manager-detector";
import { resolveCommand } from "package-manager-detector";
import { z } from "zod";
import {
  canonicalConfigFile,
  canonicalPath,
  pathWithin,
  toPosixPath,
} from "./paths.js";
import { configDirOptions, readConfig } from "./config-inputs.js";
import { explainedRoots, listedFiles } from "./compiler-output.js";

type CommandResult = {
  readonly ok: boolean;
  readonly output: string;
};

async function runLocal(
  packageRoot: string,
  agent: Agent,
  argv: readonly string[],
): Promise<CommandResult> {
  const command = resolveCommand(agent, "execute-local", [...argv]);
  if (command === null)
    return {
      ok: false,
      output: `${argv[0]} is not installed in this package`,
    };
  try {
    // TypeScript uses PWD to spell paths even when cwd is canonical.
    const output = await spawnAsync(command.command, command.args, {
      cwd: packageRoot,
      env: { ...process.env, PWD: packageRoot },
    });
    return { ok: true, output };
  } catch (error) {
    return {
      ok: false,
      output:
        error instanceof SpawnError && error.stdout.length !== 0
          ? error.stdout
          : error instanceof Error
            ? error.message
            : `${argv[0]} failed`,
    };
  }
}

const configSchema = z.object({
  compilerOptions: z.looseObject({
    declaration: z.boolean().optional(),
    composite: z.boolean().optional(),
    incremental: z.boolean().optional(),
    declarationDir: z.string().optional(),
    outDir: z.string().optional(),
    rootDir: z.string().optional(),
    noEmit: z.boolean().optional(),
    emitDeclarationOnly: z.boolean().optional(),
    sourceMap: z.boolean().optional(),
    declarationMap: z.boolean().optional(),
    jsx: z.string().optional(),
    outFile: z.string().optional(),
    tsBuildInfoFile: z.string().optional(),
    resolveJsonModule: z.boolean().optional(),
  }),
  references: z.array(z.object({ path: z.string() })).optional(),
});

export type CompilerProject = {
  readonly diagnostic?: string;
  readonly configFile: string;
  readonly options: z.infer<typeof configSchema>["compilerOptions"];
  readonly sources: readonly string[];
  readonly external: boolean;
  readonly emitRoot: string;
  readonly references: readonly string[];
};

/** What `tsc --build` on the package's root config reads and writes. */
export type CompilePlan = {
  /** A diagnostic tsc reports for a build it still runs, such as TS18003 for a project with no inputs. */
  readonly preflightTypeError?: string;
  /** The root project, then the projects it references. */
  readonly projects: readonly [CompilerProject, ...CompilerProject[]];
  /** What the build writes, relative to the package root. */
  readonly outputs: {
    readonly directories: readonly string[];
    readonly files: readonly string[];
  };
};
export type CompilePreflight =
  | { readonly ok: true; readonly plan: CompilePlan }
  | { readonly ok: false; readonly summary: string };

class CompilerDiagnostic extends Error {
  constructor(
    summary: string,
    readonly configFile: string,
    readonly noWrites: boolean,
  ) {
    super(summary);
  }
}

function projectConfigFile(path: string): string {
  const entry = statSync(path, { throwIfNoEntry: false });
  return canonicalConfigFile(
    entry?.isDirectory() || (entry === undefined && !path.endsWith(".json"))
      ? join(path, "tsconfig.json")
      : path,
  );
}

export function commonSourceDirectory(
  files: readonly string[],
  fallback: string,
): string {
  let root = files.length === 0 ? fallback : dirname(files[0] ?? fallback);
  for (const file of files)
    while (pathWithin(root, file) === null) {
      const parent = dirname(root);
      if (parent === root)
        throw new Error(
          "TypeScript sources on different drives have no common source directory.",
        );
      root = parent;
    }
  return root;
}

function outputFiles(
  project: CompilerProject,
  emitsBuildInfoInBuildMode: boolean,
): string[] {
  const { options, sources, configFile } = project;
  const directory = dirname(configFile);
  const root = project.emitRoot;
  const buildInfo =
    options.tsBuildInfoFile !== undefined
      ? resolve(directory, options.tsBuildInfoFile)
      : options.outFile !== undefined
        ? resolve(
            directory,
            options.outFile.replace(/\.[^.]+$/, "") + ".tsbuildinfo",
          )
        : options.outDir !== undefined
          ? resolve(
              directory,
              options.outDir,
              options.rootDir === undefined ? "" : relative(root, directory),
              basename(configFile).replace(/\.json$/i, ".tsbuildinfo"),
            )
          : configFile.replace(/\.json$/i, ".tsbuildinfo");
  const files =
    emitsBuildInfoInBuildMode ||
    options.composite ||
    options.incremental ||
    options.tsBuildInfoFile !== undefined
      ? [buildInfo]
      : [];
  if (options.noEmit) return files;
  const declares = options.declaration === true || options.composite === true;
  if (options.outFile !== undefined) {
    const output = resolve(directory, options.outFile);
    if (!options.emitDeclarationOnly)
      files.push(output, ...(options.sourceMap ? [output + ".map"] : []));
    if (declares)
      files.push(
        output.replace(/\.[^.]+$/, ".d.ts"),
        ...(options.declarationMap
          ? [output.replace(/\.[^.]+$/, ".d.ts.map")]
          : []),
      );
    return files;
  }
  for (const source of sources) {
    if (/\.json$/i.test(source)) {
      if (!options.emitDeclarationOnly) {
        const inside = pathWithin(root, source);
        files.push(
          options.outDir === undefined || inside === null
            ? source
            : resolve(directory, options.outDir, inside),
        );
      }
      continue;
    }
    const suffix = /\.[cm]?[jt]sx?$/i;
    const jsExtension = /\.[cm][jt]s$/i.test(source)
      ? source.slice(-4).replace("t", "j")
      : options.jsx === "preserve" && /[jt]sx$/i.test(source)
        ? ".jsx"
        : ".js";
    const declarationExtension = /\.[cm][jt]s$/i.test(source)
      ? source.slice(-4).replace(/j/, "t").replace(".", ".d.")
      : ".d.ts";
    const inRoot = pathWithin(root, source);
    const destination = (out: string | undefined, extension: string): string =>
      out === undefined || inRoot === null
        ? source.replace(suffix, extension)
        : resolve(directory, out, inRoot.replace(suffix, extension));
    if (!options.emitDeclarationOnly) {
      const js = destination(options.outDir, jsExtension);
      files.push(js, ...(options.sourceMap ? [js + ".map"] : []));
    }
    if (declares) {
      const declaration = destination(
        options.declarationDir ?? options.outDir,
        declarationExtension,
      );
      files.push(
        declaration,
        ...(options.declarationMap ? [declaration + ".map"] : []),
      );
    }
  }
  return files;
}

/**
 * Reads the package's project graph through its own `tsc` and predicts what
 * `tsc --build` writes, without writing. Refuses a build that would write
 * outside the package.
 */
export async function prepareCompile(
  packageRoot: string,
  agent: Agent,
): Promise<CompilePreflight> {
  try {
    const version = await runLocal(packageRoot, agent, ["tsc", "--version"]);
    const match = /Version (\d+)\.(\d+)/.exec(version.output);
    if (match === null)
      throw new Error(
        "The installed TypeScript version could not be resolved.",
      );
    const major = Number(match[1]);
    const minor = Number(match[2]);
    // From 5.6, `tsc --build` writes a .tsbuildinfo for every project it
    // builds; from 6.0, rootDir defaults to the config's directory.
    const emitsBuildInfoInBuildMode = major > 5 || (major === 5 && minor >= 6);
    const defaultsRootDirToConfig = major >= 6;
    const projects = await readProjectGraph(
      packageRoot,
      agent,
      join(packageRoot, "tsconfig.json"),
      defaultsRootDirToConfig,
      /Version (\S+)/.exec(version.output)?.[1] ?? `${major}.${minor}.0`,
    );
    return {
      ok: true,
      plan: checkedCompilePlan(
        packageRoot,
        projects,
        emitsBuildInfoInBuildMode,
      ),
    };
  } catch (error) {
    if (
      error instanceof CompilerDiagnostic &&
      error.noWrites &&
      error.configFile === projectConfigFile(join(packageRoot, "tsconfig.json"))
    ) {
      const checked = checkedCompilePlan(
        packageRoot,
        [
          {
            configFile: error.configFile,
            options: { noEmit: true },
            sources: [],
            external: false,
            emitRoot: packageRoot,
            references: [],
          },
        ],
        false,
      );
      return {
        ok: true,
        plan: { ...checked, preflightTypeError: error.message },
      };
    }
    return {
      ok: false,
      summary:
        error instanceof Error
          ? error.message
          : "The TypeScript output layout could not be resolved.",
    };
  }
}

async function readProjectGraph(
  packageRoot: string,
  agent: Agent,
  configPath: string,
  defaultsRootDirToConfig: boolean,
  compilerVersion: string,
): Promise<CompilerProject[]> {
  const projects: CompilerProject[] = [];
  const visited = new Set<string>();
  const rootConfig = projectConfigFile(join(packageRoot, "tsconfig.json"));
  const visit = async (path: string): Promise<void> => {
    const configFile = projectConfigFile(path);
    if (visited.has(configFile)) return;
    visited.add(configFile);
    let shown = await runLocal(packageRoot, agent, [
      "tsc",
      "-p",
      configFile,
      "--showConfig",
    ]);
    let diagnostic: string | undefined;
    if (
      !shown.ok &&
      /TS18003/.test(shown.output) &&
      pathWithin(packageRoot, configFile) !== null
    ) {
      diagnostic = shown.output;
      shown = await showEmptyProjectConfig(
        packageRoot,
        agent,
        configFile,
        compilerVersion,
      );
    }
    if (!shown.ok) {
      throw new CompilerDiagnostic(
        shown.output,
        configFile,
        statSync(configFile, { throwIfNoEntry: false }) === undefined,
      );
    }
    const config = configSchema.parse(JSON.parse(shown.output));
    const project = await refreshProject(
      packageRoot,
      agent,
      {
        ...(diagnostic !== undefined && { diagnostic }),
        configFile,
        options: config.compilerOptions,
        sources: [],
        references: (config.references ?? []).map((reference) =>
          projectConfigFile(resolve(dirname(configFile), reference.path)),
        ),
        emitRoot: dirname(configFile),
        external:
          configFile !== rootConfig &&
          pathWithin(packageRoot, configFile) === null,
      },
      defaultsRootDirToConfig,
    );
    projects.push(project);
    for (const reference of project.references) await visit(reference);
  };
  await visit(configPath);
  return projects;
}

async function showEmptyProjectConfig(
  packageRoot: string,
  agent: Agent,
  configFile: string,
  compilerVersion: string,
): Promise<CommandResult> {
  const config = z
    .object({ references: configSchema.shape.references })
    .parse(readConfig(configFile));
  const directory = canonicalPath(
    mkdtempSync(join(tmpdir(), ".ph-preflight-")),
  );
  try {
    const probe = join(directory, "tsconfig.json");
    writeFileSync(
      probe,
      JSON.stringify({
        extends: configFile,
        compilerOptions: configDirOptions(configFile, compilerVersion),
        files: [configFile],
        include: [],
        references: config.references?.map(({ path }) => ({
          path: resolve(dirname(configFile), path),
        })),
      }),
    );
    const shown = await runLocal(packageRoot, agent, [
      "tsc",
      "-p",
      probe,
      "--showConfig",
    ]);
    if (!shown.ok) return shown;
    const resolved = configSchema.parse(JSON.parse(shown.output));
    const options = resolved.compilerOptions;
    const rebase = (path: string): string => {
      const absolute = resolve(directory, path);
      const inProbe = pathWithin(directory, absolute);
      return inProbe === null
        ? absolute
        : resolve(dirname(configFile), inProbe);
    };
    // showConfig rebases inherited paths to the probe directory.
    for (const key of [
      "outDir",
      "declarationDir",
      "rootDir",
      "outFile",
      "tsBuildInfoFile",
    ] as const) {
      const path = options[key];
      if (path !== undefined) options[key] = rebase(path);
    }
    return { ...shown, output: JSON.stringify(resolved) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function listProjectFiles(
  packageRoot: string,
  agent: Agent,
  configFile: string,
  preserveSymlinks = false,
) {
  const listed = await runLocal(packageRoot, agent, [
    "tsc",
    "-p",
    configFile,
    "--listFilesOnly",
    "--explainFiles",
    "--pretty",
    "false",
    ...(preserveSymlinks ? ["--preserveSymlinks", "true"] : []),
  ]);
  return {
    ...listed,
    files: listedFiles(listed.output, packageRoot),
    rootFiles: explainedRoots(listed.output, packageRoot),
  };
}

async function refreshProject(
  packageRoot: string,
  agent: Agent,
  project: CompilerProject,
  defaultsRootDirToConfig: boolean,
): Promise<CompilerProject> {
  const listed = await listProjectFiles(packageRoot, agent, project.configFile);
  const { files, rootFiles } = listed;
  if (!listed.ok && files.length === 0 && !/TS18003/.test(listed.output)) {
    throw new CompilerDiagnostic(listed.output, project.configFile, false);
  }
  const roots = new Set(rootFiles.map((file) => canonicalPath(file)));
  let sources = files.filter(
    (file) =>
      (/\.[cm]?[jt]sx?$/i.test(file) ||
        (project.options.resolveJsonModule === true &&
          /\.json$/i.test(file))) &&
      !/\.d\.[cm]?ts$/i.test(file) &&
      (roots.has(canonicalPath(file)) ||
        !toPosixPath(file).includes("/node_modules/")),
  );
  if (
    sources.some(
      (file) =>
        !roots.has(canonicalPath(file)) &&
        pathWithin(packageRoot, canonicalPath(file)) === null,
    )
  ) {
    const preserved = await listProjectFiles(
      packageRoot,
      agent,
      project.configFile,
      true,
    );
    const spellings = preserved.files;
    if (spellings.length === 0)
      throw new Error(
        "tsc could not classify external library inputs without writing them.",
      );
    const local = new Set(
      spellings
        .filter(
          (file) =>
            roots.has(canonicalPath(file)) ||
            !toPosixPath(file).includes("/node_modules/"),
        )
        .map((path) => canonicalPath(path)),
    );
    const libraries = new Set(
      spellings
        .filter((file) => toPosixPath(file).includes("/node_modules/"))
        .map((path) => canonicalPath(path)),
    );
    sources = sources.filter(
      (file) =>
        !libraries.has(canonicalPath(file)) || local.has(canonicalPath(file)),
    );
  }
  return {
    ...project,
    ...(/TS18003/.test(listed.output) && {
      diagnostic: listed.output,
    }),
    sources,
    emitRoot: resolve(
      dirname(project.configFile),
      project.options.rootDir ??
        (project.options.composite || defaultsRootDirToConfig
          ? "."
          : commonSourceDirectory(sources, dirname(project.configFile))),
    ),
  };
}

function checkedCompilePlan(
  packageRoot: string,
  projects: readonly CompilerProject[],
  emitsBuildInfoInBuildMode: boolean,
): CompilePlan {
  const directories = new Set<string>();
  const files = new Set<string>();
  for (const project of projects) {
    if (project.external) continue;
    if (!project.options.noEmit) {
      for (const option of [
        project.options.outDir,
        project.options.declarationDir,
      ]) {
        if (option === undefined) continue;
        const path = resolve(dirname(project.configFile), option);
        const target = canonicalPath(path);
        if (pathWithin(packageRoot, target) === null)
          throw new Error(
            `tsc would write to ${JSON.stringify(path)} outside the package.`,
          );
        if (
          !project.sources.some(
            (file) => pathWithin(target, canonicalPath(file)) !== null,
          )
        ) {
          if (pathWithin(packageRoot, path) !== null)
            directories.add(toPosixPath(relative(packageRoot, path)));
          directories.add(toPosixPath(relative(packageRoot, target)));
        }
      }
    }
    for (const path of outputFiles(project, emitsBuildInfoInBuildMode)) {
      if (/\.json$/i.test(path) && project.sources.includes(path)) continue;
      const target = canonicalPath(path, { resolveMissingLinks: true });
      if (pathWithin(packageRoot, target) === null)
        throw new Error(
          `tsc would write to ${JSON.stringify(path)} outside the package.`,
        );
      if (pathWithin(packageRoot, path) !== null)
        files.add(toPosixPath(relative(packageRoot, path)));
      files.add(toPosixPath(relative(packageRoot, target)));
    }
  }
  const root = projects.at(0);
  const references = projects.slice(1);
  if (root === undefined)
    throw new Error("The root TypeScript project could not be resolved.");
  return {
    ...(root.diagnostic !== undefined && {
      preflightTypeError: root.diagnostic,
    }),
    projects: [root, ...references],
    outputs: {
      directories: [...directories].sort(),
      files: [...files].sort(),
    },
  };
}
