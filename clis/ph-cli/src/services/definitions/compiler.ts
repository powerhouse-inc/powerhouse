import { SpawnError, spawnAsync } from "@powerhousedao/shared/clis";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { Agent } from "package-manager-detector";
import { resolveCommand } from "package-manager-detector";
import { z } from "zod";
import {
  canonicalConfigFile,
  canonicalPath,
  pathWithin,
  scratchDirectory,
} from "./paths.js";
import { toPosixPath } from "./package-revision.js";
import { configChain, configDirOptions, readConfig } from "./config-inputs.js";
import { explainedRoots, listedFiles } from "./compiler-output.js";
import { walkFiles } from "./file-walk.js";

type CommandResult = {
  readonly ok: boolean;
  readonly output: string;
};

export async function runLocal(
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
    module: z.string().optional(),
    outFile: z.string().optional(),
    tsBuildInfoFile: z.string().optional(),
    allowImportingTsExtensions: z.boolean().optional(),
    resolveJsonModule: z.boolean().optional(),
    baseUrl: z.string().optional(),
    paths: z.record(z.string(), z.array(z.string())).optional(),
    rootDirs: z.array(z.string()).optional(),
    typeRoots: z.array(z.string()).optional(),
  }),
  references: z.array(z.object({ path: z.string() })).optional(),
});

export type CompilerProject = {
  readonly compilerVersion: string;
  readonly diagnostic?: string;
  readonly configFile: string;
  readonly options: z.infer<typeof configSchema>["compilerOptions"];
  readonly files: readonly string[];
  readonly rootFiles: readonly string[];
  readonly sources: readonly string[];
  readonly external: boolean;
  readonly emitRoot: string;
  readonly references: readonly string[];
};

export type OutputInventory = {
  readonly directories: readonly string[];
  readonly files: readonly string[];
};

export type CompilePlan = {
  readonly preflightTypeError?: string;
  readonly projects: readonly [CompilerProject, ...CompilerProject[]];
  readonly outputs: OutputInventory;
  readonly loadDefinitions: boolean;
  readonly emitsBuildInfoInBuildMode: boolean;
  readonly defaultsRootDirToConfig: boolean;
  readonly destinations: readonly {
    readonly configured: string;
    readonly target: string;
  }[];
};
export type CompilePreflight =
  | { readonly ok: true; readonly plan: CompilePlan }
  | { readonly ok: false; readonly summary: string };

export class CompilePreflightError extends Error {}

class CompilerDiagnostic extends CompilePreflightError {
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
          "TypeScript sources on different drives cannot share a loader tree.",
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

export async function prepareCompile(
  packageRoot: string,
  agent: Agent,
  loadDefinitions = true,
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
    const supportsNoCheck = major > 5 || (major === 5 && minor >= 6);
    const emitsBuildInfoInBuildMode = supportsNoCheck;
    const defaultsRootDirToConfig = major >= 6;
    const supportsImportRewriting = major > 5 || (major === 5 && minor >= 7);
    if (loadDefinitions && !supportsNoCheck)
      throw new Error(
        "Checking code-first definitions and subgraphs requires TypeScript 5.6 or newer for the private loader emit.",
      );
    const projects = await readProjectGraph(
      packageRoot,
      agent,
      join(packageRoot, "tsconfig.json"),
      defaultsRootDirToConfig,
      /Version (\S+)/.exec(version.output)?.[1] ?? `${major}.${minor}.0`,
    );
    if (
      loadDefinitions &&
      projects.some((project) => project.options.allowImportingTsExtensions) &&
      !supportsImportRewriting
    )
      throw new Error(
        "Checking code-first definitions and subgraphs with allowImportingTsExtensions requires TypeScript 5.7 or newer to rewrite imports.",
      );
    return {
      ok: true,
      plan: checkedCompilePlan(
        packageRoot,
        projects,
        loadDefinitions,
        emitsBuildInfoInBuildMode,
        defaultsRootDirToConfig,
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
            compilerVersion: "0.0.0",
            options: { noEmit: true },
            files: [],
            rootFiles: [],
            sources: [],
            external: false,
            emitRoot: packageRoot,
            references: [],
          },
        ],
        loadDefinitions,
        false,
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
        error instanceof CompilerDiagnostic
          ? `${error.message}\n--ignore-type-errors cannot bypass this preflight failure because TypeScript could write unchecked outputs.`
          : error instanceof Error
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
      const diagnostic = shown.output;
      throw new CompilerDiagnostic(
        diagnostic,
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
        compilerVersion,
        options: config.compilerOptions,
        files: [],
        rootFiles: [],
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
      "baseUrl",
    ] as const) {
      const path = options[key];
      if (path !== undefined) options[key] = rebase(path);
    }
    for (const key of ["rootDirs", "typeRoots"] as const)
      if (options[key] !== undefined) options[key] = options[key].map(rebase);
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
    const diagnostic = listed.output;
    throw new CompilerDiagnostic(diagnostic, project.configFile, false);
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
    files,
    rootFiles,
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
  loadDefinitions: boolean,
  emitsBuildInfoInBuildMode: boolean,
  defaultsRootDirToConfig: boolean,
): CompilePlan {
  const directories = new Set<string>();
  const files = new Set<string>();
  const destinations: { configured: string; target: string }[] = [];
  const scratch = scratchDirectory(packageRoot);
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
          throw new CompilePreflightError(
            `tsc would write to ${JSON.stringify(path)} outside the package.`,
          );
        if (pathWithin(scratch, target) !== null)
          throw new CompilePreflightError(
            `tsc would write to ${JSON.stringify(path)} inside .ph/build, which every build clears.`,
          );
        destinations.push({ configured: path, target });
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
        throw new CompilePreflightError(
          `tsc would write to ${JSON.stringify(path)} outside the package.`,
        );
      if (pathWithin(scratch, target) !== null)
        throw new CompilePreflightError(
          `tsc would write to ${JSON.stringify(path)} inside .ph/build, which every build clears.`,
        );
      const parent = dirname(path);
      destinations.push({
        configured: parent,
        target: canonicalPath(parent),
      });
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
    emitsBuildInfoInBuildMode,
    defaultsRootDirToConfig,
    loadDefinitions,
    destinations: [
      ...new Map(
        destinations.map((destination) => [
          destination.configured,
          destination,
        ]),
      ).values(),
    ],
    outputs: {
      directories: [...directories].sort(),
      files: [...files].sort(),
    },
  };
}

export async function refreshCompileGraph(
  packageRoot: string,
  agent: Agent,
  plan: CompilePlan,
  configFile: string,
): Promise<CompilePlan> {
  const refreshed = await readProjectGraph(
    packageRoot,
    agent,
    configFile,
    plan.defaultsRootDirToConfig,
    plan.projects[0].compilerVersion,
  );
  const updated = new Map(
    refreshed.map((project) => [project.configFile, project]),
  );
  const projects =
    configFile === plan.projects[0].configFile
      ? refreshed
      : [
          ...plan.projects.map(
            (project) => updated.get(project.configFile) ?? project,
          ),
          ...refreshed.filter(
            (project) =>
              !plan.projects.some(
                (previous) => previous.configFile === project.configFile,
              ),
          ),
        ];
  return checkedCompilePlan(
    packageRoot,
    projects,
    plan.loadDefinitions,
    plan.emitsBuildInfoInBuildMode,
    plan.defaultsRootDirToConfig,
  );
}

/**
 * Whether `tsc --build configFile` needs `--force`: a project's build info
 * says it is up to date while one of its outputs is gone. Without build info
 * tsc builds the project anyway, and `--force` would rebuild every project
 * it references as well.
 */
export function hasMissingCompileOutputs(
  plan: CompilePlan,
  configFile = plan.projects[0].configFile,
): boolean {
  const visited = new Set<string>();
  const missing = (configFile: string): boolean => {
    if (visited.has(configFile)) return false;
    visited.add(configFile);
    const project = plan.projects.find(
      (project) => project.configFile === configFile,
    );
    if (project === undefined) return false;
    const outputs = outputFiles(project, plan.emitsBuildInfoInBuildMode);
    const buildInfo = outputs.find((path) => /\.tsbuildinfo$/i.test(path));
    return (
      ((buildInfo === undefined || existsSync(buildInfo)) &&
        outputs.some((path) => !existsSync(path))) ||
      project.references.some(missing)
    );
  };
  return missing(configFile);
}

export function runtimeOutput(
  project: CompilerProject,
  source: string,
): string {
  const runtimeProject = {
    ...project,
    sources: [source],
    emitRoot: project.options.noEmit
      ? commonSourceDirectory(project.sources, dirname(project.configFile))
      : project.emitRoot,
    options: {
      ...project.options,
      noEmit: false,
      emitDeclarationOnly: false,
      declaration: false,
      composite: false,
      incremental: false,
      tsBuildInfoFile: undefined,
      outFile: undefined,
    },
  };
  const output = outputFiles(runtimeProject, false).find((path) =>
    /\.(?:[cm]?jsx?|json)$/i.test(path),
  );
  if (output === undefined)
    throw new Error(
      `TypeScript's runtime output could not be predicted for ${JSON.stringify(source)}.`,
    );
  return output;
}

export function declarationOutputs(project: CompilerProject): string[] {
  return outputFiles(project, false).filter(
    (path) =>
      /\.d\.[cm]?ts$/i.test(path) &&
      statSync(path, { throwIfNoEntry: false })?.isFile(),
  );
}

export function inventoryFiles(
  packageRoot: string,
  inventory: OutputInventory,
): string[] {
  const files = new Set(inventory.files);
  const scratch = scratchDirectory(packageRoot);
  for (const directory of inventory.directories)
    for (const path of walkFiles(resolve(packageRoot, directory), {
      excludedPaths: [scratch],
    }))
      files.add(toPosixPath(relative(packageRoot, path)));
  return [...files].sort();
}

export async function compilerProjectInputs(
  packageRoot: string,
  agent: Agent,
  configFiles: readonly string[],
): Promise<string[]> {
  if (configFiles.length === 0) return [];
  const version = await runLocal(packageRoot, agent, ["tsc", "--version"]);
  const compilerVersion = /Version (\S+)/.exec(version.output)?.[1];
  if (compilerVersion === undefined)
    throw new Error("The installed TypeScript version could not be resolved.");
  const inputs = new Set<string>();
  for (const configFile of configFiles) {
    const listed = await listProjectFiles(packageRoot, agent, configFile);
    const { files } = listed;
    if (!listed.ok && files.length === 0) throw new Error(listed.output);
    for (const file of [...files, ...configChain(configFile, compilerVersion)])
      inputs.add(canonicalPath(file));
  }
  return [...inputs].sort();
}

export function compilePlanInputs(
  projects: readonly CompilerProject[],
): string[] {
  return [
    ...new Set(
      projects
        .flatMap((project) => [
          ...project.files,
          ...configChain(project.configFile, project.compilerVersion),
        ])
        .map((file) => canonicalPath(file)),
    ),
  ].sort();
}
