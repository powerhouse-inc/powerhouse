import { execFile } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  compareCodeUnits,
  digestJson as digestValue,
  filesBelow,
  normalizePath,
  sha256,
} from "./utils.js";

export { digestValue };

export const B5_CASE_IDS = ["node", "browser-worker"] as const;
export type B5CaseId = (typeof B5_CASE_IDS)[number];

export type PackedLogicalDefinition = {
  readonly key: string;
  readonly version: number;
  readonly specificationDigest: `sha256:${string}`;
  readonly sdlDigest: `sha256:${string}`;
  readonly actionNames: readonly string[];
  readonly definitionDigest: `sha256:${string}` | null;
};

export type PackedFileManifest = {
  readonly packageName: "@powerhousedao/code-first-packed-fixture";
  readonly packageVersion: "0.0.0";
  readonly files: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly digest: `sha256:${string}`;
  }[];
};

export type PackedDependencyTree = {
  readonly name: string;
  readonly version: string;
  readonly dependencies: Readonly<
    Record<
      string,
      {
        readonly version: string;
        readonly dependencies: Readonly<Record<string, unknown>>;
      }
    >
  >;
};

export type PackedResolverTrace = {
  readonly caseId: B5CaseId;
  readonly requests: readonly {
    readonly specifier: string;
    readonly from: string;
    readonly resolved: string | null;
    readonly matchedConditions: readonly string[];
  }[];
};

export type PackedConsumerCheckMetrics = {
  readonly files: number;
  readonly libraryLines: number;
  readonly definitionLines: number;
  readonly typescriptLines: number;
  readonly identifiers: number;
  readonly symbols: number;
  readonly types: number;
  readonly instantiations: number;
};

export type PackedWorkerHandshake = {
  readonly status: "ok";
  readonly actionType: string;
  readonly splitEntryMatches: boolean;
  readonly resolvedEntries: {
    readonly root: string;
    readonly documentModels: string;
  };
} | null;

export type PackedConsumerResult = {
  readonly caseId: B5CaseId;
  readonly tarballDigest: `sha256:${string}`;
  readonly lockfileDigest: `sha256:${string}`;
  readonly packedFileManifestDigest: `sha256:${string}`;
  readonly dependencyTreeDigest: `sha256:${string}`;
  readonly resolverTraceDigest: `sha256:${string}`;
  readonly declarationEntry: string;
  readonly declarationBytes: number;
  readonly checkMetrics: PackedConsumerCheckMetrics;
  readonly importedLogicalKeys: readonly string[];
  readonly workerHandshake: PackedWorkerHandshake;
  readonly escapedPaths: readonly string[];
};

type RuntimeObservation = {
  readonly projection: readonly PackedLogicalDefinition[];
  readonly actionType: string;
  readonly splitEntryMatches: boolean;
  readonly resolvedEntries: {
    readonly root: string;
    readonly documentModels: string;
  };
  readonly status?: "ok";
};

export type PackedConsumerObservation = PackedConsumerResult & {
  readonly projection: readonly PackedLogicalDefinition[];
  readonly actionType: string;
  readonly splitEntryMatches: boolean;
  readonly resolvedEntries: {
    readonly root: string;
    readonly documentModels: string;
  };
  readonly installedPackageIsSymlink: boolean;
  readonly lockfileUsesLocalTarball: boolean;
};

export type PackedConsumerProbeResult = {
  readonly tarballDigest: `sha256:${string}`;
  readonly packedFileManifest: PackedFileManifest;
  readonly packedFileManifestDigest: `sha256:${string}`;
  readonly dependencyTrees: Readonly<Record<B5CaseId, PackedDependencyTree>>;
  readonly resolverTraces: Readonly<Record<B5CaseId, PackedResolverTrace>>;
  readonly consumers: readonly PackedConsumerObservation[];
};

type TsdownBuild = (
  options: Readonly<Record<string, unknown>>,
) => Promise<void>;

type CommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

const packageName = "@powerhousedao/code-first-packed-fixture";
const packageDirectory =
  "node_modules/@powerhousedao/code-first-packed-fixture";
const publicSpecifiers = [
  packageName,
  `${packageName}/document-models`,
] as const;

export function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pathInside(root: string, path: string): string | null {
  const child = relative(root, path);
  if (
    child === "" ||
    (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child))
  ) {
    return normalizePath(child || ".");
  }
  return null;
}

async function runCommand(
  file: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
  },
): Promise<CommandResult> {
  return new Promise((resolveCommand) => {
    execFile(
      file,
      [...args],
      {
        cwd: options.cwd,
        env: options.env,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolveCommand({
          exitCode:
            typeof error?.code === "number"
              ? error.code
              : error === null
                ? 0
                : 1,
          stdout,
          stderr,
        });
      },
    );
  });
}

function requireSuccess(
  result: CommandResult,
  description: string,
): CommandResult {
  if (result.exitCode === 0) return result;
  const detail = (result.stderr || result.stdout).trim();
  throw new Error(
    `${description} failed with exit ${result.exitCode}${detail ? `: ${detail}` : ""}`,
  );
}

async function buildPackage(
  repositoryRoot: string,
  fixtureRoot: string,
  stagingPackageRoot: string,
): Promise<void> {
  const sourcePackageRoot = resolve(fixtureRoot, "package");
  const require = createRequire(
    resolve(repositoryRoot, "clis/ph-cli/package.json"),
  );
  const tsdownPath = require.resolve("tsdown");
  const tsdown = (await import(pathToFileURL(tsdownPath).href)) as {
    readonly build: TsdownBuild;
  };
  await mkdir(resolve(stagingPackageRoot, "dist"), { recursive: true });
  await tsdown.build({
    cwd: sourcePackageRoot,
    config: false,
    entry: {
      node: resolve(sourcePackageRoot, "src/node.ts"),
      browser: resolve(sourcePackageRoot, "src/browser.ts"),
    },
    outDir: resolve(stagingPackageRoot, "dist"),
    platform: "neutral",
    format: "esm",
    clean: true,
    dts: true,
    sourcemap: false,
    logLevel: "warn",
  });
  await Promise.all([
    copyFile(
      resolve(sourcePackageRoot, "package.json"),
      resolve(stagingPackageRoot, "package.json"),
    ),
    copyFile(
      resolve(sourcePackageRoot, "style.css"),
      resolve(stagingPackageRoot, "style.css"),
    ),
  ]);
}

async function packedFileManifest(
  stagingPackageRoot: string,
): Promise<PackedFileManifest> {
  const files = await filesBelow(stagingPackageRoot);
  return {
    packageName,
    packageVersion: "0.0.0",
    files: await Promise.all(
      files.map(async (path) => {
        const bytes = await readFile(path);
        return {
          path: `package/${normalizePath(relative(stagingPackageRoot, path))}`,
          bytes: bytes.byteLength,
          digest: sha256(bytes),
        };
      }),
    ),
  };
}

async function packPackage(
  stagingPackageRoot: string,
  stagingRoot: string,
): Promise<string> {
  const destination = resolve(stagingRoot, "tarball");
  await mkdir(destination, { recursive: true });
  const result = requireSuccess(
    await runCommand(
      "npm",
      ["pack", "--json", "--pack-destination", destination],
      { cwd: stagingPackageRoot },
    ),
    "npm pack",
  );
  const metadata = JSON.parse(result.stdout) as readonly {
    readonly filename: string;
  }[];
  const filename = metadata[0]?.filename;
  if (!filename || metadata.length !== 1) {
    throw new Error("npm pack did not emit exactly one tarball.");
  }
  return resolve(destination, filename);
}

function consumerPackageJson(caseId: B5CaseId): object {
  return {
    name: `b5-${caseId}-consumer`,
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: { [packageName]: "file:./package.tgz" },
  };
}

function consumerTsconfig(caseId: B5CaseId): object {
  const browser = caseId === "browser-worker";
  return {
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: "ES2022",
      module: browser ? "ESNext" : "NodeNext",
      moduleResolution: browser ? "Bundler" : "NodeNext",
      lib: browser ? ["ES2022", "WebWorker"] : ["ES2022"],
      types: [],
      // Matches the repository consumer profile. Public consumer expressions are
      // still checked; transitive library declarations are not revalidated.
      skipLibCheck: true,
      ...(browser ? { customConditions: ["browser"] } : {}),
    },
    include: ["consumer.ts"],
  };
}

async function prepareConsumer(
  fixtureRoot: string,
  caseId: B5CaseId,
  consumerRoot: string,
  tarballPath: string,
): Promise<void> {
  await mkdir(consumerRoot, { recursive: true });
  const sourceRoot = resolve(fixtureRoot, caseId);
  const sourceFiles = await filesBelow(sourceRoot);
  await Promise.all([
    ...sourceFiles
      .filter((path) => !path.endsWith(".gitkeep"))
      .map((path) =>
        copyFile(path, resolve(consumerRoot, relative(sourceRoot, path))),
      ),
    copyFile(tarballPath, resolve(consumerRoot, "package.tgz")),
    writeFile(
      resolve(consumerRoot, "package.json"),
      jsonBytes(consumerPackageJson(caseId)),
    ),
    writeFile(
      resolve(consumerRoot, "tsconfig.json"),
      jsonBytes(consumerTsconfig(caseId)),
    ),
  ]);
}

type NpmTree = {
  readonly name?: string;
  readonly version?: string;
  readonly dependencies?: Readonly<Record<string, NpmTree>>;
};

function normalizeDependencyTree(tree: NpmTree): PackedDependencyTree {
  const dependencies = Object.fromEntries(
    Object.entries(tree.dependencies ?? {})
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([name, dependency]) => [
        name,
        {
          version: dependency.version ?? "unknown",
          dependencies: normalizeNestedDependencies(dependency.dependencies),
        },
      ]),
  );
  return {
    name: tree.name ?? "unknown",
    version: tree.version ?? "unknown",
    dependencies,
  };
}

function normalizeNestedDependencies(
  dependencies: NpmTree["dependencies"],
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(dependencies ?? {})
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([name, dependency]) => [
        name,
        {
          version: dependency.version ?? "unknown",
          dependencies: normalizeNestedDependencies(dependency.dependencies),
        },
      ]),
  );
}

function extractInteger(output: string, label: string): number {
  const match = output.match(new RegExp(`^${label}:\\s+([0-9]+)$`, "m"));
  if (!match) throw new Error(`TypeScript did not report ${label}.`);
  return Number(match[1]);
}

function checkMetrics(output: string): PackedConsumerCheckMetrics {
  return {
    files: extractInteger(output, "Files"),
    libraryLines: extractInteger(output, "Lines of Library"),
    definitionLines: extractInteger(output, "Lines of Definitions"),
    typescriptLines: extractInteger(output, "Lines of TypeScript"),
    identifiers: extractInteger(output, "Identifiers"),
    symbols: extractInteger(output, "Symbols"),
    types: extractInteger(output, "Types"),
    instantiations: extractInteger(output, "Instantiations"),
  };
}

function normalizeTracePath(path: string, consumerRoot: string): string {
  const within = pathInside(consumerRoot, path);
  return within ?? `<outside>/${normalizePath(path)}`;
}

function resolverTrace(
  output: string,
  caseId: B5CaseId,
  consumerRoot: string,
): PackedResolverTrace {
  const starts = new Map<string, { from: string; conditions: string[] }>();
  const requests: {
    specifier: string;
    from: string;
    resolved: string | null;
    matchedConditions: string[];
  }[] = [];
  const startPattern =
    /^======== Resolving module '([^']+)' from '([^']+)'. ========$/;
  const successPattern =
    /^======== Module name '([^']+)' was successfully resolved to '([^']+)'(?: with Package ID '[^']+')?. ========$/;
  const failurePattern =
    /^======== Module name '([^']+)' was not resolved. ========$/;
  const conditionPattern = /^Matched 'exports' condition '([^']+)'.$/;
  let active: string | null = null;
  for (const line of output.split(/\r?\n/)) {
    const start = line.match(startPattern);
    if (
      start &&
      publicSpecifiers.includes(start[1] as (typeof publicSpecifiers)[number])
    ) {
      active = start[1];
      starts.set(active, { from: start[2], conditions: [] });
      continue;
    }
    if (active) {
      const condition = line.match(conditionPattern);
      if (condition) starts.get(active)?.conditions.push(condition[1]);
    }
    const success = line.match(successPattern);
    const failure = line.match(failurePattern);
    const completed = success?.[1] ?? failure?.[1];
    if (
      !completed ||
      !publicSpecifiers.includes(completed as (typeof publicSpecifiers)[number])
    ) {
      continue;
    }
    const state = starts.get(completed);
    requests.push({
      specifier: completed,
      from: state ? normalizeTracePath(state.from, consumerRoot) : "unknown",
      resolved: success ? normalizeTracePath(success[2], consumerRoot) : null,
      matchedConditions: [...new Set(state?.conditions ?? [])],
    });
    starts.delete(completed);
    active = null;
  }
  requests.sort((left, right) =>
    compareCodeUnits(left.specifier, right.specifier),
  );
  return { caseId, requests };
}

function parseMarkedResult(stdout: string, marker: string): RuntimeObservation {
  const index = stdout.lastIndexOf(marker);
  if (index < 0) throw new Error(`Runtime probe emitted no ${marker} marker.`);
  return JSON.parse(
    stdout.slice(index + marker.length).trim(),
  ) as RuntimeObservation;
}

function normalizedResolvedEntries(
  entries: RuntimeObservation["resolvedEntries"],
  consumerRoot: string,
): {
  readonly entries: RuntimeObservation["resolvedEntries"];
  readonly escaped: readonly string[];
} {
  const escaped: string[] = [];
  const normalize = (value: string): string => {
    const path = value.startsWith("file:") ? fileURLToPath(value) : value;
    const inside = pathInside(consumerRoot, path);
    if (inside !== null) return inside;
    escaped.push(normalizePath(path));
    return `<outside>/${normalizePath(path)}`;
  };
  return {
    entries: {
      root: normalize(entries.root),
      documentModels: normalize(entries.documentModels),
    },
    escaped,
  };
}

async function declarationBytes(installedPackageRoot: string): Promise<number> {
  const declarations = (await filesBelow(installedPackageRoot)).filter(
    (path) => path.endsWith(".d.ts") || path.endsWith(".d.mts"),
  );
  return declarations.reduce(
    async (total, path) => (await total) + (await stat(path)).size,
    Promise.resolve(0),
  );
}

async function runConsumer(request: {
  readonly repositoryRoot: string;
  readonly fixtureRoot: string;
  readonly caseId: B5CaseId;
  readonly consumerRoot: string;
  readonly tarballPath: string;
  readonly tarballDigest: `sha256:${string}`;
  readonly packedFileManifestDigest: `sha256:${string}`;
}): Promise<{
  readonly result: PackedConsumerObservation;
  readonly dependencyTree: PackedDependencyTree;
  readonly resolverTrace: PackedResolverTrace;
}> {
  const { caseId } = request;
  await prepareConsumer(
    request.fixtureRoot,
    caseId,
    request.consumerRoot,
    request.tarballPath,
  );
  // macOS exposes its temporary directory through both /var and /private/var.
  // Resolve the root once so containment checks compare canonical paths.
  const consumerRoot = await realpath(request.consumerRoot);
  const npmCache = resolve(consumerRoot, ".npm-cache");
  await mkdir(npmCache, { recursive: true });
  const npmEnvironment = {
    ...process.env,
    npm_config_cache: npmCache,
    npm_config_offline: "true",
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_ignore_scripts: "true",
    npm_config_update_notifier: "false",
  };
  requireSuccess(
    await runCommand(
      "npm",
      ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"],
      { cwd: consumerRoot, env: npmEnvironment },
    ),
    `${caseId} offline install`,
  );
  const lockfilePath = resolve(consumerRoot, "package-lock.json");
  const lockfileBytes = await readFile(lockfilePath);
  const lockfile = JSON.parse(lockfileBytes.toString("utf8")) as {
    readonly packages?: Readonly<
      Record<string, { readonly resolved?: string }>
    >;
  };
  const installedPackageRoot = resolve(consumerRoot, packageDirectory);
  const installedMetadata = await lstat(installedPackageRoot);
  const installedRealpath = await realpath(installedPackageRoot);
  const installedEscape = pathInside(consumerRoot, installedRealpath);

  const require = createRequire(import.meta.url);
  const tscPath = require.resolve("typescript/bin/tsc");
  const typecheck = requireSuccess(
    await runCommand(
      process.execPath,
      [
        tscPath,
        "--project",
        "tsconfig.json",
        "--traceResolution",
        "--extendedDiagnostics",
        "--pretty",
        "false",
      ],
      { cwd: consumerRoot },
    ),
    `${caseId} packed declaration typecheck`,
  );
  const trace = resolverTrace(typecheck.stdout, caseId, consumerRoot);
  if (trace.requests.length !== publicSpecifiers.length) {
    throw new Error(
      `${caseId} resolved ${trace.requests.length} packed entries instead of ${publicSpecifiers.length}.`,
    );
  }

  const runtime = requireSuccess(
    await runCommand(
      process.execPath,
      caseId === "node" ? ["runtime.mjs"] : ["launcher.mjs"],
      { cwd: consumerRoot },
    ),
    `${caseId} packed runtime import`,
  );
  const runtimeObservation = parseMarkedResult(
    runtime.stdout,
    caseId === "node" ? "__PH_B5_NODE__" : "__PH_B5_WORKER__",
  );
  const normalizedEntries = normalizedResolvedEntries(
    runtimeObservation.resolvedEntries,
    consumerRoot,
  );
  const dependencyResult = requireSuccess(
    await runCommand("npm", ["ls", "--all", "--json"], {
      cwd: consumerRoot,
      env: npmEnvironment,
    }),
    `${caseId} dependency tree`,
  );
  const dependencyTree = normalizeDependencyTree(
    JSON.parse(dependencyResult.stdout) as NpmTree,
  );
  const packageLockEntry = lockfile.packages?.[packageDirectory];
  const declarationEntry = `${packageDirectory}/dist/node.d.ts`;
  const escapedPaths = [
    ...(installedEscape === null ? [normalizePath(installedRealpath)] : []),
    ...normalizedEntries.escaped,
    ...trace.requests
      .filter(({ resolved }) => resolved?.startsWith("<outside>/"))
      .map(({ resolved }) => resolved ?? ""),
  ].sort(compareCodeUnits);
  const workerHandshake: PackedWorkerHandshake =
    caseId === "browser-worker"
      ? {
          status: runtimeObservation.status ?? "ok",
          actionType: runtimeObservation.actionType,
          splitEntryMatches: runtimeObservation.splitEntryMatches,
          resolvedEntries: normalizedEntries.entries,
        }
      : null;
  const result: PackedConsumerObservation = {
    caseId,
    tarballDigest: request.tarballDigest,
    lockfileDigest: sha256(lockfileBytes),
    packedFileManifestDigest: request.packedFileManifestDigest,
    dependencyTreeDigest: digestValue(dependencyTree),
    resolverTraceDigest: digestValue(trace),
    declarationEntry,
    declarationBytes: await declarationBytes(installedPackageRoot),
    checkMetrics: checkMetrics(typecheck.stdout),
    importedLogicalKeys: runtimeObservation.projection.map(({ key }) => key),
    workerHandshake,
    escapedPaths,
    projection: runtimeObservation.projection,
    actionType: runtimeObservation.actionType,
    splitEntryMatches: runtimeObservation.splitEntryMatches,
    resolvedEntries: normalizedEntries.entries,
    installedPackageIsSymlink: installedMetadata.isSymbolicLink(),
    lockfileUsesLocalTarball:
      packageLockEntry?.resolved === "file:package.tgz" ||
      packageLockEntry?.resolved === "file:./package.tgz",
  };
  return { result, dependencyTree, resolverTrace: trace };
}

export async function probePackedConsumers(
  request: {
    readonly packageRoot?: string;
    readonly retainTarballAt?: string;
  } = {},
): Promise<PackedConsumerProbeResult> {
  const packageRoot = resolve(
    request.packageRoot ?? resolve(import.meta.dirname, "../.."),
  );
  const repositoryRoot = resolve(packageRoot, "../..");
  const fixtureRoot = resolve(packageRoot, "fixtures/packed-consumers");
  const stagingRoot = await mkdtemp(join(tmpdir(), "powerhouse-b5-pack-"));
  try {
    const stagingPackageRoot = resolve(stagingRoot, "package");
    await mkdir(stagingPackageRoot, { recursive: true });
    await buildPackage(repositoryRoot, fixtureRoot, stagingPackageRoot);
    const manifest = await packedFileManifest(stagingPackageRoot);
    const manifestDigest = digestValue(manifest);
    const tarballPath = await packPackage(stagingPackageRoot, stagingRoot);
    const tarballBytes = await readFile(tarballPath);
    const tarballDigest = sha256(tarballBytes);
    if (request.retainTarballAt) {
      await mkdir(dirname(request.retainTarballAt), { recursive: true });
      await copyFile(tarballPath, request.retainTarballAt);
    }
    const consumerRuns = await Promise.all(
      B5_CASE_IDS.map((caseId) =>
        runConsumer({
          repositoryRoot,
          fixtureRoot,
          caseId,
          consumerRoot: resolve(stagingRoot, "consumers", caseId),
          tarballPath,
          tarballDigest,
          packedFileManifestDigest: manifestDigest,
        }),
      ),
    );
    return {
      tarballDigest,
      packedFileManifest: manifest,
      packedFileManifestDigest: manifestDigest,
      dependencyTrees: Object.fromEntries(
        consumerRuns.map(({ result, dependencyTree }) => [
          result.caseId,
          dependencyTree,
        ]),
      ) as Readonly<Record<B5CaseId, PackedDependencyTree>>,
      resolverTraces: Object.fromEntries(
        consumerRuns.map(({ result, resolverTrace }) => [
          result.caseId,
          resolverTrace,
        ]),
      ) as Readonly<Record<B5CaseId, PackedResolverTrace>>,
      consumers: consumerRuns.map(({ result }) => result),
    };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}
