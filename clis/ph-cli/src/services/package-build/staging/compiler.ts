import { lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Agent } from "package-manager-detector";
import {
  buildInfoFile,
  type EmitOptions,
  outFileOutputs,
} from "../../compiler-output/emit.js";
import { prepareCompile } from "../../definitions/compiler.js";
import {
  pathWithin,
  realPathThroughExistingParent,
} from "@powerhousedao/shared/clis/real-paths";
import {
  type CompilerOutput,
  compilerOutputInventory,
  type ShownConfig,
} from "./inventory.js";
function writesBesideSources(options: EmitOptions): boolean {
  if (options.noEmit || options.outFile !== undefined) return false;
  if (options.outDir !== undefined) return false;
  const declares = options.declaration === true || options.composite === true;
  return !options.emitDeclarationOnly || (declares && !options.declarationDir);
}

type InventoryPlace = Parameters<typeof compilerOutputInventory>[1];

const redirectable = ({ references, options }: ShownConfig) =>
  references.length === 0 &&
  Boolean(options.incremental || options.composite || options.tsBuildInfoFile);

export async function compilerOutputs(
  config: ShownConfig,
  at: InventoryPlace & {
    readonly agent: Agent;
    readonly output: string;
  },
): Promise<CompilerOutput[]> {
  const root = compilerOutputInventory(config.options, at);
  const real = (path: string) => realPathThroughExistingParent(path);
  const packageIdentity = real(at.packageRoot);
  const inPackage = (path: string) =>
    pathWithin(packageIdentity, real(path)) !== null;
  // A reference to another package is that package's build: its outputs are
  // not this package's to restore, and reading its project graph spawns tsc
  // once or twice per project it reaches.
  const referencesInPackage = config.references.some((reference) =>
    inPackage(resolve(dirname(at.configFile), reference)),
  );
  const holdsOutput = (dir: string) =>
    pathWithin(real(dir), at.output) !== null;
  const protectsOutput = root.some(
    ({ kind, path }) =>
      kind === "directory" &&
      holdsOutput(path) &&
      !(redirectable(config) && real(path) === at.output),
  );
  if (
    !referencesInPackage &&
    !writesBesideSources(config.options) &&
    !protectsOutput
  ) {
    return root;
  }
  const prepared = await prepareCompile(at.packageRoot, at.agent);
  if (!prepared.ok) return root;
  const { directories, files } = prepared.plan.outputs;
  const absolute = (path: string) => resolve(at.packageRoot, path);
  const owned = (path: string) =>
    inPackage(path) && pathWithin(path, at.buildDirectory) === null;
  const dirs = directories
    .map(absolute)
    .filter((dir) => owned(dir) && !holdsOutput(dir));
  return [
    ...files
      .map(absolute)
      .filter(
        (file) =>
          owned(file) && !dirs.some((dir) => pathWithin(dir, file) !== null),
      )
      .map((path) => ({
        path,
        kind: path.endsWith(".tsbuildinfo")
          ? ("build-info" as const)
          : ("file" as const),
      }))
      .sort(
        (a, b) =>
          Number(b.kind === "build-info") - Number(a.kind === "build-info"),
      ),
    ...dirs.map((path) => ({ path, kind: "directory" as const })),
  ];
}

export type CompilerRedirect = {
  readonly compilerOptions: Readonly<Record<string, string>>;
  readonly exclude: readonly string[] | undefined;
  readonly pendingBuildInfo:
    | { readonly path: string; readonly target: string }
    | undefined;
  readonly staged: readonly string[];
};

export function redirectRootProject(
  config: ShownConfig,
  at: {
    readonly configFile: string;
    readonly packageRoot: string;
    readonly output: string;
    readonly stage: string;
    readonly pending: (target: string) => string;
  },
): CompilerRedirect | undefined {
  if (!redirectable(config)) return undefined;
  const { options } = config;
  const configDir = dirname(at.configFile);
  const real = (path: string) => realPathThroughExistingParent(path);
  const inOutput = (path: string) => pathWithin(at.output, real(path));
  const compilerOptions: Record<string, string> = {};
  const staged: string[] = [];
  for (const key of ["declarationDir", "outDir", "outFile"] as const) {
    const value = options[key];
    if (value === undefined || (key === "outFile" && options.noEmit)) continue;
    const rel = inOutput(resolve(configDir, value));
    if (rel === null) continue;
    compilerOptions[key] = join(at.stage, rel);
    staged.push(
      ...(key === "outFile"
        ? outFileOutputs(options, at.configFile)
        : [resolve(configDir, value)]
      ).map(real),
    );
  }
  const target = buildInfoFile(options, at.configFile);
  const rel = inOutput(target);
  let pendingBuildInfo: CompilerRedirect["pendingBuildInfo"];
  if (rel !== null) {
    compilerOptions.tsBuildInfoFile = join(at.stage, rel);
    staged.push(real(target));
  } else if (
    pathWithin(at.packageRoot, target) !== null &&
    // A copy of the link would write through to the live file; tsc writes
    // it in place instead, and the run snapshots what the link points to.
    !lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()
  ) {
    pendingBuildInfo = { path: at.pending(target), target };
    compilerOptions.tsBuildInfoFile = pendingBuildInfo.path;
    staged.push(real(target));
  } else {
    compilerOptions.tsBuildInfoFile = target;
  }
  return { compilerOptions, exclude: config.exclude, pendingBuildInfo, staged };
}
