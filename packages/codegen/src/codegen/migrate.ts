import {
  BOILERPLATE_DEPENDENCY_OVERRIDES,
  BOILERPLATE_TRANSITIVE_OVERRIDES,
  externalDevDependencies,
  FEATURE_DEPENDENCIES,
  type FileChange,
  getPackageManagerAtPowerhouseProjectDirPath,
  getPowerhouseProjectInstallCommand,
  LEGACY_LINT_FORMAT_DEPENDENCIES,
  LEGACY_DEV_HOST,
  LEGACY_DEV_HOST_DEV_DEPENDENCIES,
  LEGACY_LINT_FORMAT_FILES,
  lowestVersion,
  packageJsonExports,
  packageScripts,
  PEER_EXTERNAL_DEPENDENCIES,
  projectFiles,
  recordWrites,
  runCmd,
  HOST_PACKAGE_SCRIPTS,
  RETIRED_PACKAGE_SCRIPTS,
  SUPERSEDED_PACKAGE_SCRIPTS,
  versionSatisfies,
  VERSIONED_DEV_DEPENDENCIES,
  VERSIONED_PEER_DEPENDENCIES,
} from "@powerhousedao/shared/clis";
import {
  assertAgentFilesCommitted,
  managedAgentPaths,
  pinFields,
  syncPackageSkills,
  writeAllGeneratedProjectFiles,
} from "file-builders";
import npmFetch from "npm-registry-fetch";
import { join } from "path";
import { type PackageJson, readPackage } from "read-pkg";
import {
  filter,
  fromKeys,
  isTruthy,
  keys,
  map,
  mapValues,
  merge,
  omit,
  pipe,
  prop,
} from "remeda";
import { toYarnResolutions } from "templates";
import { buildTsMorphProject, fixGenerateMockImports } from "utils";
import { writePackage } from "write-package";
import { detectFeatures, type Feature } from "./features.js";
import { modelGeneration } from "./document-model-generation.js";
import { assertDocumentModelAggregatesWritable } from "../file-builders/document-model/aggregates.js";
import {
  HOSTS_TSC_SCRIPT,
  withHostsTscScript,
} from "../file-builders/hosts/host-typing-files.js";
import {
  addHostsFolder,
  getsHostsFolder,
  hasHostAfterMigration,
} from "./migrate-hosts.js";
import { assertVersionedDocumentModels } from "./migrate-layout-floor.js";
import {
  migrateHomeBackground,
  migratePowerhouseConfig,
} from "./migrate-powerhouse-config.js";
import { migrateSupersededConfig } from "./migrate-superseded-config.js";
import { migrateTsconfigFiles } from "./migrate-tsconfig.js";
import { sortByKey } from "./utils.js";

// Every workspace package a migration can pin. A release publishes them one
// by one, so their dist-tags move at different times.
const PINNED_WORKSPACE_PACKAGES = [
  ...VERSIONED_PEER_DEPENDENCIES,
  ...VERSIONED_DEV_DEPENDENCIES,
  ...LEGACY_DEV_HOST_DEV_DEPENDENCIES,
  ...Object.values(FEATURE_DEPENDENCIES).flatMap((f) => [
    ...f.peerVersioned,
    ...f.devVersioned,
  ]),
];

/* Resolves a dist-tag to the newest version it names for every pinned package */
export async function getFullyQualifiedWorkspacePackageVersion(
  versionOrTag: string,
) {
  const isTag =
    versionOrTag === "latest" ||
    versionOrTag === "staging" ||
    versionOrTag === "dev" ||
    versionOrTag === "rc" ||
    versionOrTag === "next";

  if (!isTag) return versionOrTag;
  const tagged = await Promise.all(
    PINNED_WORKSPACE_PACKAGES.map(async (name) => {
      const tags = (await npmFetch.json(
        `/-/package/${encodeURIComponent(name)}/dist-tags`,
      )) as Partial<Record<string, string>>;
      return { name, version: tags[versionOrTag] };
    }),
  );
  // A package not published on this channel pins nothing to it.
  const versions = tagged.map((t) => t.version).filter(isTruthy);
  const version = lowestVersion(versions);
  if (!version) {
    throw new Error(`No package is published under "${versionOrTag}".`);
  }
  const ahead = tagged.filter((t) => t.version && t.version !== version);
  if (ahead.length > 0) {
    console.log(
      `"${versionOrTag}" differs across packages; using ${version}, the lowest (ahead: ${ahead.map((t) => `${t.name}@${t.version}`).join(", ")})`,
    );
  }
  return version;
}

function isProtectedVersionSpec(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.startsWith("workspace:") || value.startsWith("catalog:"))
  );
}

// Keeps user-declared `workspace:*` / `catalog:` refs intact when the caller
// would otherwise replace them with a hard pin during migration.
function preserveProtected(
  newValues: Record<string, string>,
  existingSources: ReadonlyArray<
    Partial<Record<string, string | undefined>> | undefined
  >,
): Record<string, string> {
  const result: Record<string, string> = { ...newValues };
  for (const key of Object.keys(newValues)) {
    for (const source of existingSources) {
      const existing = source?.[key];
      if (isProtectedVersionSpec(existing)) {
        result[key] = existing;
        break;
      }
    }
  }
  return result;
}

// The dependency sets migrate rewrites, as a pure function of what it read.
// Split out so the rewrite can be checked without a registry or an install.
//
// Managed names: the versioned Powerhouse packages (VERSIONED_PEER_DEPENDENCIES,
// VERSIONED_DEV_DEPENDENCIES and those of the project's features), the external
// pins (PEER_EXTERNAL_DEPENDENCIES, externalDevDependencies, a feature's
// peerExternal), the scaffold pins (BOILERPLATE_DEPENDENCY_OVERRIDES) and the
// removed LEGACY_LINT_FORMAT_DEPENDENCIES. A managed name is added to the peer
// and dev sets or updated there, and leaves `dependencies` for them, as
// syncFeatureDependencies moves it. Every other entry is the project's own and
// stays in the field the project wrote it in; in `dependencies` only a
// workspace package's version is updated. LEGACY_DEV_HOST_DEV_DEPENDENCIES are
// managed only with `hasLegacyDevHost`: the project has hosts/vetra.
export function resolveManagedDependencies(input: {
  packageJson: PackageJson;
  features: readonly Feature[];
  fullyQualifiedVersion: string;
  workspacePackageNames: readonly string[];
  hasLegacyDevHost?: boolean;
}) {
  const {
    packageJson,
    features,
    fullyQualifiedVersion,
    workspacePackageNames,
    hasLegacyDevHost = false,
  } = input;
  const featurePeerVersioned = features.flatMap(
    (f) => FEATURE_DEPENDENCIES[f].peerVersioned as readonly string[],
  );
  const featureDevVersioned = features.flatMap(
    (f) => FEATURE_DEPENDENCIES[f].devVersioned as readonly string[],
  );
  const featurePeerExternal = features.reduce<
    Record<string, { peer: string; dev: string }>
  >((acc, f) => ({ ...acc, ...FEATURE_DEPENDENCIES[f].peerExternal }), {});

  const managedPeerVersioned = [
    ...VERSIONED_PEER_DEPENDENCIES,
    ...featurePeerVersioned,
  ];
  const managedPeerNames = [
    ...managedPeerVersioned,
    ...keys(PEER_EXTERNAL_DEPENDENCIES),
    ...keys(featurePeerExternal),
  ];
  // featureDevVersioned lands here and so also in managedDevNames, which the
  // peer pipe omits — a dev-only feature dep is stripped from peers by that.
  const managedDevVersioned = [
    ...VERSIONED_DEV_DEPENDENCIES,
    ...(hasLegacyDevHost ? LEGACY_DEV_HOST_DEV_DEPENDENCIES : []),
    ...managedPeerVersioned,
    ...featureDevVersioned,
  ];
  const managedDevNames = [
    ...managedDevVersioned,
    ...keys(externalDevDependencies),
    ...keys(featurePeerExternal),
  ];

  const peerExternals = {
    ...mapValues(PEER_EXTERNAL_DEPENDENCIES, (v) => v.peer),
    ...mapValues(featurePeerExternal, (v) => v.peer),
  };
  const peerDevPins = {
    ...mapValues(PEER_EXTERNAL_DEPENDENCIES, (v) => v.dev),
    ...mapValues(featurePeerExternal, (v) => v.dev),
  };

  const existingDepSources = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
  ];

  const peerDependencies = pipe(
    packageJson.peerDependencies ?? {},
    omit([...managedDevNames, ...LEGACY_LINT_FORMAT_DEPENDENCIES]),
    merge(
      preserveProtected(
        {
          ...fromKeys(managedPeerVersioned, () => fullyQualifiedVersion),
          ...peerExternals,
        },
        existingDepSources,
      ),
    ),
    mapValues((value, key) =>
      isProtectedVersionSpec(value)
        ? value
        : workspacePackageNames.includes(key)
          ? fullyQualifiedVersion
          : value,
    ),
    sortByKey,
  );

  const leavesDependencies: readonly string[] = [
    ...managedPeerNames,
    ...managedDevNames,
    ...LEGACY_LINT_FORMAT_DEPENDENCIES,
  ];
  const ownDependencies = Object.fromEntries(
    Object.entries(packageJson.dependencies ?? {}).flatMap(
      ([name, value]): [string, string][] => {
        if (value === undefined || leavesDependencies.includes(name)) return [];
        const updated =
          !isProtectedVersionSpec(value) && workspacePackageNames.includes(name)
            ? fullyQualifiedVersion
            : value;
        return [[name, updated]];
      },
    ),
  );
  // The block stays unless the migration moved its last entry out.
  const dependencies =
    packageJson.dependencies !== undefined &&
    (keys(ownDependencies).length > 0 ||
      keys(packageJson.dependencies).length === 0)
      ? ownDependencies
      : undefined;

  const devDependencies = pipe(
    packageJson.devDependencies ?? {},
    omit([...managedPeerNames, ...LEGACY_LINT_FORMAT_DEPENDENCIES]),
    merge(
      preserveProtected(
        {
          ...fromKeys(managedDevVersioned, () => fullyQualifiedVersion),
          ...externalDevDependencies,
          ...peerDevPins,
        },
        existingDepSources,
      ),
    ),
    mapValues((value, key) =>
      isProtectedVersionSpec(value)
        ? value
        : workspacePackageNames.includes(key)
          ? fullyQualifiedVersion
          : value,
    ),
    sortByKey,
  );
  // Decided on what the migration leaves, so a second run decides the same.
  const pins = scaffoldPins({
    optionalDependencies: packageJson.optionalDependencies,
    peerDependencies,
    dependencies,
    devDependencies,
    overrides: packageJson.overrides,
    resolutions: packageJson.resolutions,
    workspaces: packageJson.workspaces,
  });

  // A pinned package the project keeps in `dependencies` is pinned there.
  const pinnedInDependencies = Object.fromEntries(
    Object.entries(pins).filter(([name]) => dependencies?.[name] !== undefined),
  );

  return {
    peerDependencies,
    dependencies: dependencies && { ...dependencies, ...pinnedInDependencies },
    devDependencies: sortByKey({
      ...devDependencies,
      ...omit(pins, keys(pinnedInDependencies)),
    }),
  };
}

// The scaffold's pins, minus any package the project manages itself: one it
// overrides or resolves on its own, or lists in any field with a spec the pin
// is not in (a local or git spec, or a range such as ^2.30.0). Pinning that
// one would change the version the project chose; npm fails with EOVERRIDE.
// A project with `workspaces` gets none: npm counts a workspace package of a
// pinned name as a direct dependency and rejects any override for it.
type PinnedFields = Pick<
  PackageJson,
  | "optionalDependencies"
  | "peerDependencies"
  | "dependencies"
  | "devDependencies"
  | "overrides"
  | "resolutions"
  | "workspaces"
>;

function scaffoldPins(packageJson: PinnedFields): Record<string, string> {
  if (packageJson.workspaces !== undefined) return {};
  const fields = dependencyFields(packageJson);
  const ownKeys = ownPinKeys(packageJson);
  return Object.fromEntries(
    Object.entries(BOILERPLATE_DEPENDENCY_OVERRIDES).filter(
      ([name, version]) =>
        fields.every(
          (field) =>
            field?.[name] === undefined ||
            versionSatisfies(version, field[name]),
        ) && !ownsPin(ownKeys, name),
    ),
  );
}

// The transitive pins (BOILERPLATE_TRANSITIVE_OVERRIDES), minus any package the
// project lists itself or overrides or resolves on its own: their npm override
// is the literal version, which npm rejects for a direct dependency.
function scaffoldTransitivePins(
  packageJson: PinnedFields,
): Record<string, string> {
  if (packageJson.workspaces !== undefined) return {};
  const fields = dependencyFields(packageJson);
  const ownKeys = ownPinKeys(packageJson);
  return Object.fromEntries(
    Object.entries(BOILERPLATE_TRANSITIVE_OVERRIDES).filter(
      ([name]) =>
        fields.every((field) => field?.[name] === undefined) &&
        !ownsPin(ownKeys, name),
    ),
  );
}

function dependencyFields(packageJson: PinnedFields) {
  return [
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
    packageJson.dependencies,
    packageJson.devDependencies,
  ];
}

// The packages the project overrides or resolves itself. Entries the scaffold
// writes, now or in an earlier scaffold, are not the project's own; nor is an
// identical entry the project wrote itself.
function ownPinKeys(packageJson: PinnedFields): string[] {
  const { resolutions, overrides } = pinFields();
  const legacy: Record<string, unknown> = toYarnResolutions(
    BOILERPLATE_DEPENDENCY_OVERRIDES,
  );
  return [
    ...Object.entries(packageJson.overrides ?? {}).filter(
      ([key, value]) => overrides[key] !== value,
    ),
    ...Object.entries(packageJson.resolutions ?? {}).filter(
      ([key, value]) => resolutions[key] !== value && legacy[key] !== value,
    ),
  ].map(([key]) => key.replace(/^\*\*\//, ""));
}

function ownsPin(ownKeys: string[], name: string) {
  return ownKeys.some((key) => key === name || key.startsWith(`${name}@`));
}

// The scripts migrate manages are the names of `packageScripts`. A missing one
// is added. One that holds a value an earlier scaffold wrote
// (SUPERSEDED_PACKAGE_SCRIPTS) is updated. Any other value is the project's
// own and stays; `kept` names those. The `tsc -p hosts` the hosts scaffold
// appends to `tsc` is carried over an update. A script that runs a host
// (HOST_PACKAGE_SCRIPTS) is managed only when the project has that host:
// without it the script stays as it is, and none is added. A script under a
// retired name (RETIRED_PACKAGE_SCRIPTS) that still holds the scaffold's value
// is replaced when the project has its host, or removed when nothing replaces
// it.
export function migratedScripts(
  existing: PackageJson["scripts"] = {},
  hasHost: (name: string) => boolean = () => true,
): {
  scripts: NonNullable<PackageJson["scripts"]>;
  kept: (keyof typeof packageScripts)[];
} {
  const scripts = { ...existing };
  const kept: (keyof typeof packageScripts)[] = [];
  const hostsSuffix = ` && ${HOSTS_TSC_SCRIPT}`;
  for (const name of keys(packageScripts)) {
    const scaffold: string = packageScripts[name];
    if (HOST_PACKAGE_SCRIPTS.includes(name) && !hasHost(name)) continue;
    const current = existing[name];
    if (current === undefined) {
      scripts[name] = scaffold;
      continue;
    }
    const withHosts = name === "tsc" && current.endsWith(hostsSuffix);
    const base = withHosts ? current.slice(0, -hostsSuffix.length) : current;
    if (base === scaffold) continue;
    if (SUPERSEDED_PACKAGE_SCRIPTS[name]?.includes(base)) {
      scripts[name] = withHosts ? withHostsTscScript(scaffold) : scaffold;
    } else {
      kept.push(name);
    }
  }
  for (const [name, retired] of Object.entries(RETIRED_PACKAGE_SCRIPTS)) {
    const current = existing[name];
    if (current === undefined || !retired.values.includes(current)) continue;
    if (retired.replacement === undefined) delete scripts[name];
    else if (retired.host === undefined || hasHost(retired.host)) {
      scripts[name] = retired.replacement;
    }
  }
  return { scripts, kept };
}

// The exports migrate manages are the keys of `packageJsonExports`: each is
// added or set to the entry `ph build` emits. Every other key is the
// project's own and stays.
export function migratedExports(
  existing: PackageJson["exports"],
): PackageJson["exports"] {
  const own =
    typeof existing === "object" &&
    existing !== null &&
    !Array.isArray(existing)
      ? existing
      : {};
  return { ...own, ...packageJsonExports } as PackageJson["exports"];
}

// package.json after the migration. `exports`, `scripts` and the dependency
// fields are merged: see migratedExports, migratedScripts and
// resolveManagedDependencies for the keys migrate manages. No key the project
// added is deleted.
export function migratedPackageJson(
  packageJson: PackageJson,
  managed: Pick<
    PackageJson,
    "peerDependencies" | "dependencies" | "devDependencies"
  >,
  hasHost?: (name: string) => boolean,
): PackageJson {
  const updated = {
    ...packageJson,
    type: packageJson.type ?? "module",
    sideEffects: packageJson.sideEffects ?? false,
    files: packageJson.files ?? ["/dist"],
    exports: migratedExports(packageJson.exports),
    scripts: migratedScripts(packageJson.scripts, hasHost).scripts,
    peerDependencies: managed.peerDependencies,
    devDependencies: managed.devDependencies,
  } as PackageJson;
  // `dependencies` holds what the project added itself; without `managed`
  // naming it, the block is left as it is.
  if ("dependencies" in managed) {
    if (managed.dependencies === undefined) delete updated.dependencies;
    else updated.dependencies = managed.dependencies;
  }
  // The `**/` keys earlier scaffolds wrote go: pnpm 9 and 10 reject them.
  const pins = pinFields(
    scaffoldPins(updated),
    scaffoldTransitivePins(updated),
  );
  // A `**/` key keeps a value the project set, under the name pnpm accepts.
  const legacy: Record<string, string> = toYarnResolutions(
    BOILERPLATE_DEPENDENCY_OVERRIDES,
  );
  const resolutions = {
    ...Object.fromEntries(
      Object.entries(packageJson.resolutions ?? {}).flatMap(([key, value]) =>
        key in legacy
          ? value === legacy[key]
            ? []
            : [[key.slice("**/".length), value]]
          : [[key, value]],
      ),
    ),
    ...pins.resolutions,
  };
  const overrides: NonNullable<PackageJson["overrides"]> = {
    ...packageJson.overrides,
    ...pins.overrides,
  };
  if (keys(resolutions).length > 0) updated.resolutions = resolutions;
  else delete updated.resolutions;
  if (keys(overrides).length > 0) updated.overrides = overrides;
  else delete updated.overrides;
  return updated;
}

export type MigrateOptions = {
  skipInstall?: boolean;
  /** Record what the run would write instead of writing it. */
  dryRun?: boolean;
};

export type MigrateResult = {
  /** The files a dry run would add, change or delete; empty after a real run. */
  changes: FileChange[];
  /** The steps a dry run leaves out: they change files it cannot preview. */
  notRun: string[];
};

export async function migrate(
  version: string,
  projectDir = process.cwd(),
  options: MigrateOptions = {},
): Promise<MigrateResult> {
  const dryRun = options.dryRun ?? false;
  // Before any write, so a stop leaves the project untouched.
  assertVersionedDocumentModels(projectDir);
  try {
    assertAgentFilesCommitted(projectDir, managedAgentPaths(projectDir));
  } catch (error) {
    // A dry run replaces nothing, so it only reports what the run would stop on.
    if (!dryRun) throw error;
    console.warn(error instanceof Error ? error.message : String(error));
  }
  assertDocumentModelAggregatesWritable(
    buildTsMorphProject(projectDir),
    projectDir,
  );
  const fullyQualifiedVersion =
    await getFullyQualifiedWorkspacePackageVersion(version);

  const packageJson = await readPackage({
    cwd: projectDir,
    normalize: false,
  });
  const workspacePackageNames = filter(
    map(WORKSPACE_PACKAGES, prop("manifest", "name")),
    isTruthy,
  );

  // Every write below goes through the write layer (projectFiles), which a
  // dry run records.
  const writeProjectFiles = async () => {
    // Read before the first write: the theme migration adds to hosts/.
    const hosts = new Map(
      [
        ...HOST_PACKAGE_SCRIPTS,
        ...Object.values(RETIRED_PACKAGE_SCRIPTS).flatMap((retired) =>
          retired.host === undefined ? [] : [retired.host],
        ),
      ].map((name) => [
        name as string,
        hasHostAfterMigration(projectDir, name),
      ]),
    );
    const hasHost = (name: string) => hosts.get(name) ?? false;
    console.log("Updating package.json...");
    await projectFiles.writeWith(join(projectDir, "package.json"), (target) =>
      writePackage(
        target,
        migratedPackageJson(
          packageJson,
          resolveManagedDependencies({
            packageJson,
            features: detectFeatures(projectDir),
            fullyQualifiedVersion,
            workspacePackageNames,
            hasLegacyDevHost: hasHost(LEGACY_DEV_HOST),
          }),
          hasHost,
        ),
      ),
    );
    for (const name of migratedScripts(packageJson.scripts, hasHost).kept) {
      console.log(
        `  kept the project's own "${name}" script; the scaffold's is \`${packageScripts[name]}\``,
      );
    }

    console.log("Removing legacy lint/format config files...");
    removeLegacyLintFormatFiles(projectDir);
    console.log("Updating project root files...");
    const agentFiles = await writeAllGeneratedProjectFiles(projectDir);
    console.log("Removing compiler options TypeScript 7 dropped...");
    for (const file of migrateTsconfigFiles(projectDir)) {
      console.log(`  updated ${file}`);
    }
    if (migratePowerhouseConfig(projectDir)) {
      console.log(
        "Removed the scaffolded connect.instance defaults from powerhouse.config.json, so the dev host picks its reactor client",
      );
    }
    const homeBackground = migrateHomeBackground(projectDir);
    if (homeBackground) console.log(homeBackground);
    // The keys the host files supersede leave powerhouse.config.json: into
    // the host files when this run adds them, else they are reported.
    const superseded = migrateSupersededConfig(
      projectDir,
      getsHostsFolder(projectDir),
    );
    if (superseded.lines.length > 0) {
      console.log("Settings of powerhouse.config.json the host files take:");
      for (const line of superseded.lines) console.log(`  ${line}`);
    }
    // After package.json and powerhouse.config.json: the host files project
    // both, and hosts/types.d.ts follows the dependencies just written.
    if (await addHostsFolder(projectDir, packageJson.name, superseded.moved)) {
      console.log(
        "Added hosts/ with the plugins this project runs today (review hosts/switchboard/host.js)",
      );
    }
    const project = buildTsMorphProject(projectDir);
    console.log("Fixing generateMock imports...");
    for (const sourceFile of project.getSourceFiles()) {
      fixGenerateMockImports(sourceFile);
    }
    return { agentFiles, project };
  };

  if (dryRun) {
    const { changes } = await recordWrites(async () => {
      const { project } = await writeProjectFiles();
      for (const sourceFile of project.getSourceFiles()) {
        if (sourceFile.isSaved()) continue;
        projectFiles.writeSync(
          sourceFile.getFilePath(),
          sourceFile.getFullText(),
        );
      }
    });
    return {
      changes,
      notRun: [
        ...(options.skipInstall ? [] : ["install the dependencies"]),
        "sync the agent skills of the installed packages",
        "re-generate the code of the document models, editors, apps, processors and subgraphs",
      ],
    };
  }

  const { agentFiles, project } = await writeProjectFiles();
  if (!options.skipInstall) {
    console.log("Installing dependencies...");
    await installProjectDependencies(projectDir);
  }
  // Packages' skills come from the versions just installed.
  agentFiles.push(...(await syncPackageSkills(projectDir)));
  console.log("Agent files (review with git diff):");
  for (const { path, action } of agentFiles) {
    console.log(`  ${path}: ${action}`);
  }
  for (const { notice } of agentFiles) {
    if (notice) console.warn(notice);
  }
  console.log("Re-generating code...");
  await modelGeneration.generateAll(project);
  await project.save();
  return { changes: [], notRun: [] };
}

function removeLegacyLintFormatFiles(projectDir: string) {
  for (const name of LEGACY_LINT_FORMAT_FILES) {
    projectFiles.remove(join(projectDir, name));
  }
}

async function installProjectDependencies(projectDir: string) {
  const agent = await getPackageManagerAtPowerhouseProjectDirPath(projectDir);
  if (!agent) {
    throw new Error(
      "Failed to detect your package manager. Run install manually.",
    );
  }
  // The generated project pins exact versions this flow just resolved from a
  // release channel, so a supply-chain policy inherited via process env (a
  // wrapping pnpm in CI exports its own workspace's `minimumReleaseAge`)
  // must not veto the install — that policy belongs to the calling project,
  // not this fresh one. pnpm-only flag; other managers have no equivalent.
  const args = agent === "pnpm" ? ["--config.minimumReleaseAge=0"] : [];
  const installCommand = await getPowerhouseProjectInstallCommand(agent, args);
  console.log(`Installing dependencies with \`${agent}\``);
  runCmd(installCommand, { cwd: projectDir });
}
