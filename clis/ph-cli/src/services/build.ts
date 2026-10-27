import {
  browserEntry,
  buildBrowserBuildConfig,
  buildNodeBuildConfig,
  findBundledSharedDeps,
} from "@powerhousedao/shared/build-config";
import type {
  BuiltPiece,
  ExternalDependency,
  TraceFiles,
} from "@powerhousedao/shared/build-pieces";
import {
  assertPiecesOutDir,
  buildPieces,
  expandEntryGlobs,
  createDetectionCache,
  externalDependencyVersions,
  projectPath,
  externalDepsPlugin,
  pieceListPath,
  planPieces,
  syncDistManifest,
  undeclaredExternalDependencies,
} from "@powerhousedao/shared/build-pieces";
import {
  localPackageNames,
  packageStyleEntry,
  packageStylesheet,
} from "@powerhousedao/shared/clis/package-style";
import {
  findSharedImports,
  EXTERNALIZABLE_SHARED_SPECIFIERS,
} from "@powerhousedao/shared/connect";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { nodeFileTrace } from "@vercel/nft";
import { detect, resolveCommand, type Agent } from "package-manager-detector";
import { readPackage } from "read-pkg";
import { build as tsdownBuild } from "tsdown";
import type { BuildArgs } from "../types.js";
import {
  HOST_ROUTES_DIR,
  OFFERED_ROUTES_MODULE,
  syncProjectConnectRoutes,
} from "../utils/sync-connect-routes.js";

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

/**
 * A Powerhouse package's `powerhouse.manifest.json` "name" must match its
 * `package.json` "name" — Connect and the registry resolve installed versions
 * by treating the manifest name as the npm package name, so a mismatch silently
 * breaks resolution. Fail the build early if they diverge. No-op when the
 * project has no manifest (nothing to compare).
 */
export async function assertManifestNameMatchesPackage(projectPath: string) {
  const manifestPath = join(projectPath, "powerhouse.manifest.json");
  if (!existsSync(manifestPath)) return;

  const { name: packageName } = await readPackage({ cwd: projectPath });

  let manifestName: unknown;
  try {
    manifestName = (
      JSON.parse(readFileSync(manifestPath, "utf-8")) as { name?: unknown }
    ).name;
  } catch {
    throw new Error(
      `Failed to parse "powerhouse.manifest.json" at ${manifestPath}. Make sure it is valid JSON.`,
    );
  }

  if (manifestName !== packageName) {
    throw new Error(
      `Package name mismatch — "package.json" and "powerhouse.manifest.json" must have the same "name":\n` +
        `  package.json             "name": ${JSON.stringify(packageName)}\n` +
        `  powerhouse.manifest.json "name": ${JSON.stringify(manifestName)}\n\n` +
        `Update one so they match, then run the build again.`,
    );
  }
}

// The manifest with `connectRoutes` set when the package offers routes; as it
// is, byte for byte, when the flag is already right.
function withOfferedRoutes(json: string, offers: boolean) {
  const manifest = JSON.parse(json) as { connectRoutes?: boolean };
  if (offers ? manifest.connectRoutes === true : !("connectRoutes" in manifest))
    return json;
  if (offers) manifest.connectRoutes = true;
  else delete manifest.connectRoutes;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const slashes = (path: string) => path.replaceAll("\\", "/");

/** Sets `connectRoutes` in the manifest the package's root module imports,
 * leaving the project's file as it is. */
export function offeredRoutesManifest(projectRoot: string, offers: boolean) {
  // Vite's ids use forward slashes on Windows too.
  const manifestPath = slashes(join(projectRoot, "powerhouse.manifest.json"));
  return {
    name: "ph-offered-routes-manifest",
    transform(code: string, id: string) {
      if (slashes(id) !== manifestPath) return null;
      return { code: withOfferedRoutes(code, offers), map: null };
    },
  };
}

/** Sets `connectRoutes` in the dist copy of the manifest. */
export function markOfferedRoutes(dir: string, offers: boolean) {
  const manifestPath = join(dir, "powerhouse.manifest.json");
  if (!existsSync(manifestPath)) return;
  const json = readFileSync(manifestPath, "utf-8");
  writeFileSync(manifestPath, withOfferedRoutes(json, offers));
}

const CONNECT_IMPORT = /^@powerhousedao\/connect(\/|$)/;

const CONNECT_IMPORT_HINT =
  "Routes a package offers other Connects import @powerhousedao/connect-core instead (ContentOutlet, ModalDialog, useDriveRouteData, useNavRoutes and useSidebarMode from @powerhousedao/connect-core/router, SidebarItem from @powerhousedao/design-system/connect); only its own host's _app.tsx and overrides may use @powerhousedao/connect.";

type ModuleGraph = {
  getModuleInfo(id: string): {
    importedIds: readonly string[];
    dynamicallyImportedIds: readonly string[];
  } | null;
  error(message: string): never;
};

function reachableFrom(graph: ModuleGraph, entry: string) {
  const reached = new Set<string>();
  const pending = [entry];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (reached.has(id)) continue;
    reached.add(id);
    const info = graph.getModuleInfo(id);
    if (info) pending.push(...info.importedIds, ...info.dynamicallyImportedIds);
  }
  return reached;
}

/** Fails the build on an import of Connect that the offered routes reach, as
 * other Connects don't share Connect with the package; warns on one from the
 * rest of the package, which bundles a copy of the Connect modules it uses. */
export function noConnectImports(routesEntry: string, routesDir: string) {
  const imports = new Map<string, Set<string>>();
  // Module ids may spell a Windows path with either separator.
  const slash = (path: string) => path.replaceAll("\\", "/");
  const isRoute = (id: string) =>
    slash(id) === slash(routesEntry) ||
    slash(id).startsWith(`${slash(routesDir)}/`);
  return {
    name: "ph-offered-routes-imports",
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !CONNECT_IMPORT.test(source)) return null;
      // Before resolving it: a route file's import fails even unresolved.
      if (isRoute(importer)) {
        throw new Error(
          `${importer} imports "${source}". ${CONNECT_IMPORT_HINT}`,
        );
      }
      const sources = imports.get(importer) ?? new Set<string>();
      imports.set(importer, sources.add(source));
      return null;
    },
    buildEnd(this: ModuleGraph, error?: Error) {
      if (error || !imports.size) return;
      const entry = this.getModuleInfo(routesEntry)
        ? routesEntry
        : slash(routesEntry);
      const reached = reachableFrom(this, entry);
      const described = ([importer, sources]: [string, Set<string>]) =>
        `${importer} imports ${[...sources].map((s) => `"${s}"`).join(", ")}`;
      const offered = [...imports].filter(([id]) => reached.has(id));
      if (offered.length) {
        this.error(
          `${offered.map(described).join("\n")}\n${CONNECT_IMPORT_HINT}`,
        );
      }
      console.warn(
        `⚠ ${[...imports].map(described).join("\n")}\nConnect isn't shared with the packages it loads, so the build bundles a copy of these modules, apart from the app's state. Import @powerhousedao/connect-core instead; a later version fails the build.`,
      );
    },
  };
}

export async function runBuild(args: BuildArgs) {
  const { outDir } = args;
  const projectRoot = process.cwd();

  // Fail fast if the manifest name and package.json name have drifted apart.
  await assertManifestNameMatchesPackage(projectRoot);

  const target = {
    projectRoot,
    outDir,
    pieces: planPieces(projectRoot, outDir),
  };
  // Before any bundler runs: an out-dir a host will never read from is worth
  // nothing built, and the failure names what the contract is.
  assertPiecesOutDir(target);
  const sharedDeps = !args.noSharedDeps;

  const detectResult = await detect();
  const agent = detectResult?.agent ?? "npm";

  // Project routes type-check against the tree generated from them.
  await syncProjectConnectRoutes(projectRoot);
  // Connect reads the manifest's flag to load the package's routes.
  const offersRoutes = existsSync(join(projectRoot, OFFERED_ROUTES_MODULE));

  // Before any bundler runs, so declining leaves nothing half built.
  const typesOk = emitTypes(agent, outDir, projectRoot);
  if (!typesOk && !args.ignoreTypeErrors) {
    await confirmBuildDespiteTypeErrors();
  }

  // Shared by the browser, node and piece builds: nothing is traced twice.
  const detection = createDetectionCache();
  const trace = createTraceFiles();
  const routesEntry = join(projectRoot, OFFERED_ROUTES_MODULE);
  // Everything in the browser build is code Connect can load: native fails it.
  await tsdownBuild({
    ...buildBrowserBuildConfig({
      sharedDeps,
      plugins: [
        externalDepsPlugin(trace, new Map(), {
          root: projectRoot,
          browser: true,
          cache: detection,
        }),
        offeredRoutesManifest(projectRoot, offersRoutes),
        noConnectImports(routesEntry, join(projectRoot, HOST_ROUTES_DIR)),
      ],
    }),
    // The offered routes in the package's build: a module both import is one
    // chunk, which other Connects evaluate once. Absolute: a relative entry
    // is a glob, and globs skip `.ph`.
    ...(offersRoutes
      ? { entry: [...browserEntry, { "connect-routes": routesEntry }] }
      : {}),
    outDir: join(outDir, "browser"),
  });

  // Advisory: a shared dep the source imports but the output no longer
  // references as a bare import was inlined despite the external set.
  if (sharedDeps) {
    const imported = findSharedImportsInSources(projectRoot, browserEntry);
    const bundled = findBundledSharedDeps(
      imported,
      readDistBrowserFiles(join(outDir, "browser")),
    );
    if (bundled.length > 0) {
      console.warn(
        `⚠ shared deps bundled instead of externalized: ${bundled.join(", ")} — check your neverBundle config`,
      );
    }
  }

  const external = new Map<string, ExternalDependency>();
  await tsdownBuild({
    ...buildNodeBuildConfig({
      sharedDeps,
      plugins: [
        // Editors never run on a host; document models run in Connect too.
        externalDepsPlugin(trace, external, {
          root: projectRoot,
          ignoreDirs: ["editors"],
          forbidDirs: ["document-models"],
          cache: detection,
        }),
      ],
    }),
    outDir: join(outDir, "node"),
  });
  const pkg = await readPackage({ cwd: projectRoot });
  assertExternalDependenciesDeclared(projectRoot, [...external.values()], pkg);

  // After the node build: it cleans <outDir>/node, where the pieces land. The
  // built list is the gate, so a `bundle:` entry is validated with no piece dir.
  let built: BuiltPiece[] = [];
  if (existsSync(pieceListPath(target))) {
    built = await buildPieces(
      target,
      {
        name: pkg.name,
        version: pkg.version,
        license: typeof pkg.license === "string" ? pkg.license : undefined,
      },
      { bundle: tsdownBuild, trace, cache: detection },
    );
  }
  syncDistManifest(
    target,
    built,
    externalDependencyVersions(external.values()),
  );
  markOfferedRoutes(outDir, offersRoutes);

  buildPackageStylesheet(agent, projectRoot, join(outDir, "browser"));

  // Last, so it is the line a finished build leaves on screen.
  if (!typesOk) console.warn(`\n${UNSAFE_BUILD_WARNING}`);
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

// tsc's build info outlives a deleted dist; with the declarations gone, tsc
// would call the project up to date and emit nothing.
function declarationsMissing(agent: Agent, projectRoot: string): boolean {
  const showConfig = resolveCommand(agent, "execute-local", [
    "tsc",
    "--showConfig",
  ]);
  if (showConfig === null) return false;
  let options: {
    declaration?: boolean;
    composite?: boolean;
    declarationDir?: string;
    outDir?: string;
  };
  try {
    const output = execSync(
      `${showConfig.command} ${showConfig.args.join(" ")}`,
      {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    options =
      (JSON.parse(output) as { compilerOptions?: typeof options })
        .compilerOptions ?? {};
  } catch {
    return false;
  }
  const dir = options.declarationDir ?? options.outDir;
  if (!dir || !(options.declaration || options.composite)) return false;
  const path = resolve(projectRoot, dir);
  return !existsSync(path) || readdirSync(path).length === 0;
}

// Runs tsc, which checks the project and writes its declarations either way.
// Returns whether it reported no type errors.
function emitTypes(agent: Agent, outDir: string, projectRoot: string): boolean {
  const force = declarationsMissing(agent, projectRoot);
  const tscCommand = resolveCommand(agent, "execute-local", [
    "tsc",
    "--build",
    ...(force ? ["--force"] : []),
  ]);
  if (tscCommand === null) {
    console.error(
      "You need to have typescript installed to use the `build` command.",
    );
    process.exit(1);
  }
  console.log("\n▶ Type-checking and emitting types via tsc...");
  try {
    execSync(`${tscCommand.command} ${tscCommand.args.join(" ")}`, {
      stdio: "inherit",
    });
    console.log("✔ Types emitted to", join(outDir, "types"));
    return true;
  } catch {
    return false;
  }
}

// The classes the browser build uses, and the package's tokens and rules, against
// Connect's theme: the Connect that loads it has Tailwind's reset and Connect's classes.
function buildPackageStylesheet(
  agent: Agent,
  projectRoot: string,
  browserDir: string,
) {
  const command = resolveCommand(agent, "execute-local", [
    "tailwindcss",
    "--input",
    "-",
    "--minify",
  ]);
  if (command === null) {
    console.error(
      "You need to have tailwindcss installed to use the `build` command.",
    );
    process.exit(1);
  }
  const stylePath = join(projectRoot, "style.css");
  const style = existsSync(stylePath)
    ? readFileSync(stylePath, "utf-8")
    : undefined;
  const compiled = execSync(`${command.command} ${command.args.join(" ")}`, {
    cwd: projectRoot,
    input: packageStyleEntry(style, {
      browserDir: sourcePath(projectRoot, browserDir),
      localPackages: localPackageNames(projectRoot),
    }),
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "inherit"],
    // A package that imports large vendor CSS outgrows the 1 MB default.
    maxBuffer: 64 * 1024 * 1024,
  });
  // `ph build` with another out-dir (the switchboard runner's) leaves no dist/.
  mkdirSync(join(projectRoot, "dist"), { recursive: true });
  writeFileSync(
    join(projectRoot, "dist/style.css"),
    packageStylesheet(compiled),
  );
}

// A path for `@source`, relative to the project, with forward slashes.
function sourcePath(projectRoot: string, path: string) {
  return `./${relative(projectRoot, resolve(projectRoot, path)).replaceAll("\\", "/")}`;
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && !process.env.CI;
}

const TYPE_ERROR_RISK =
  "A package built with type errors can load and still fail at runtime.";

const UNSAFE_BUILD_WARNING =
  "⚠ Built despite type errors. " +
  TYPE_ERROR_RISK +
  " Fix them before you publish or deploy it.";

async function confirmBuildDespiteTypeErrors(): Promise<void> {
  const hint =
    "Fix them and build again. --ignore-type-errors skips this check, at the risk of shipping that failure.";
  if (!isInteractive()) {
    console.error(
      `\n✘ tsc reported the type errors above. ${TYPE_ERROR_RISK}\n${hint}`,
    );
    process.exit(1);
  }
  const enquirer = await import("enquirer");
  let confirmed: boolean;
  try {
    const answer = await enquirer.default.prompt<{ confirmed: boolean }>({
      type: "confirm",
      name: "confirmed",
      message: `tsc reported the type errors above. ${TYPE_ERROR_RISK} Build anyway?`,
      initial: false,
    });
    confirmed = answer.confirmed;
  } catch {
    // Ctrl-C at the prompt is a decline.
    confirmed = false;
  }
  if (!confirmed) {
    console.error(`Build cancelled. ${hint}`);
    process.exit(1);
  }
}

/**
 * Every shared specifier imported from the entry sources; the post-build
 * scan compares these against the built output.
 *
 * Scoped to the specifiers the build actually externalizes: a specifier the
 * vendor does not publish (the bare `@powerhousedao/shared` root, an
 * unvendored subpath) is deliberately bundled, so reporting it as "bundled
 * instead of externalized" would be a false alarm.
 */
function findSharedImportsInSources(root: string, globs: string[]): string[] {
  const found = new Set<string>();
  for (const file of expandEntryGlobs(root, globs)) {
    const src = readFileSync(file, "utf8");
    for (const spec of findSharedImports(
      src,
      EXTERNALIZABLE_SHARED_SPECIFIERS,
    )) {
      found.add(spec);
    }
  }
  return [...found].sort();
}

/**
 * The built JS outputs of a browser build (entry files and chunks).
 */
function readDistBrowserFiles(
  dir: string,
): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  if (!existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".js")) {
        out.push({ path: p, content: readFileSync(p, "utf8") });
      }
    }
  };
  walk(dir);
  return out;
}
