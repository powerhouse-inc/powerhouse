import {
  BOILERPLATE_DEPENDENCY_OVERRIDES,
  externalDevDependencies,
  FEATURE_DEPENDENCIES,
  getPackageManagerAtPowerhouseProjectDirPath,
  getPowerhouseProjectInstallCommand,
  LEGACY_LINT_FORMAT_DEPENDENCIES,
  LEGACY_LINT_FORMAT_FILES,
  lowestVersion,
  packageJsonExports,
  packageScripts,
  PEER_EXTERNAL_DEPENDENCIES,
  runCmd,
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
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
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
import type { Project } from "ts-morph";
import { buildTsMorphProject, fixGenerateMockImports } from "utils";
import { writePackage } from "write-package";
import { detectFeatures, type Feature } from "./features.js";
import { generateAll } from "./generate.js";
import { migratePowerhouseConfig } from "./migrate-powerhouse-config.js";
import { migrateTsconfigFiles } from "./migrate-tsconfig.js";
import { sortByKey } from "./utils.js";

// Every workspace package a migration can pin. A release publishes them one
// by one, so their dist-tags move at different times.
const PINNED_WORKSPACE_PACKAGES = [
  ...VERSIONED_PEER_DEPENDENCIES,
  ...VERSIONED_DEV_DEPENDENCIES,
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
    versionOrTag === "dev";

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

export function fixLegacyImportPaths(
  project: Project,
  packageName: string | undefined,
) {
  if (!packageName) {
    console.error("No package name found in package.json.");
    return;
  }
  const sourceFiles = project.getSourceFiles();
  for (const sourceFile of sourceFiles) {
    const importStatements = sourceFile.getImportDeclarations();
    for (const importStatement of importStatements) {
      const moduleSpecifier = importStatement.getModuleSpecifier();
      const moduleSpecifierText = moduleSpecifier.getLiteralText();
      // remove usage of the old `package-name/` style paths
      if (moduleSpecifierText.includes(packageName)) {
        moduleSpecifier.setLiteralValue(
          moduleSpecifierText.replace(`${packageName}/`, ""),
        );
      }
      // attempt to fix absolute import paths for document models like `../../../document-models/model/something/something.js`
      // these don't work anymore with the versioned document models, since the absolute file paths are different
      const match = moduleSpecifierText.match(
        /^(\.\.\/)+document-models\/([^/]+)(?!\/v\d+(?:\/|$))(?:\/.*)?$/,
      );

      if (match) {
        moduleSpecifier.setLiteralValue(`document-models/${match[2]}`);
      }
    }
    fixGenerateMockImports(sourceFile);
  }
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

// The peer and dev sets migrate rewrites, as a pure function of what it read.
// Split out so the rewrite can be checked without a registry or an install.
export function resolveManagedDependencies(input: {
  packageJson: PackageJson;
  features: readonly Feature[];
  fullyQualifiedVersion: string;
  workspacePackageNames: readonly string[];
}) {
  const {
    packageJson,
    features,
    fullyQualifiedVersion,
    workspacePackageNames,
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

  const devDependencies = pipe(
    merge(packageJson.dependencies ?? {}, packageJson.devDependencies ?? {}),
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
    devDependencies,
    overrides: packageJson.overrides,
    resolutions: packageJson.resolutions,
    workspaces: packageJson.workspaces,
  });

  return {
    peerDependencies,
    devDependencies: sortByKey({ ...devDependencies, ...pins }),
  };
}

// The scaffold's pins, minus any package the project manages itself: one it
// overrides or resolves on its own, or lists in any field with a spec the pin
// is not in (a local or git spec, or a range such as ^2.30.0). Pinning that
// one would change the version the project chose; npm fails with EOVERRIDE.
// A project with `workspaces` gets none: npm counts a workspace package of a
// pinned name as a direct dependency and rejects any override for it.
function scaffoldPins(
  packageJson: Pick<
    PackageJson,
    | "optionalDependencies"
    | "peerDependencies"
    | "dependencies"
    | "devDependencies"
    | "overrides"
    | "resolutions"
    | "workspaces"
  >,
): Record<string, string> {
  if (packageJson.workspaces !== undefined) return {};
  const fields = [
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
    packageJson.dependencies,
    packageJson.devDependencies,
  ];
  // Entries this function writes, now or in an earlier scaffold, are not the
  // project's own; nor is an identical entry the project wrote itself.
  const { resolutions, overrides } = pinFields();
  const legacy: Record<string, unknown> = toYarnResolutions(
    BOILERPLATE_DEPENDENCY_OVERRIDES,
  );
  const ownKeys = [
    ...Object.entries(packageJson.overrides ?? {}).filter(
      ([key, value]) => overrides[key] !== value,
    ),
    ...Object.entries(packageJson.resolutions ?? {}).filter(
      ([key, value]) => resolutions[key] !== value && legacy[key] !== value,
    ),
  ].map(([key]) => key.replace(/^\*\*\//, ""));
  return Object.fromEntries(
    Object.entries(BOILERPLATE_DEPENDENCY_OVERRIDES).filter(
      ([name, version]) =>
        fields.every(
          (field) =>
            field?.[name] === undefined ||
            versionSatisfies(version, field[name]),
        ) && !ownKeys.some((key) => key === name || key.startsWith(`${name}@`)),
    ),
  );
}

// Exports and scripts are replaced with the current ones, so an entry `ph build`
// no longer emits (such as a browser ./subgraphs) is dropped.
export function migratedPackageJson(
  packageJson: PackageJson,
  managed: Pick<PackageJson, "peerDependencies" | "devDependencies">,
): PackageJson {
  const updated = {
    ...packageJson,
    type: packageJson.type ?? "module",
    sideEffects: packageJson.sideEffects ?? false,
    files: packageJson.files ?? ["/dist"],
    exports: packageJsonExports,
    scripts: merge(packageJson.scripts, packageScripts),
    peerDependencies: managed.peerDependencies,
    devDependencies: managed.devDependencies,
  } as PackageJson;
  // Runtime `dependencies` block is no longer emitted — the bundled dist
  // self-contains everything except the declared peers.
  delete (updated as { dependencies?: unknown }).dependencies;
  // The `**/` keys earlier scaffolds wrote go: pnpm 9 and 10 reject them.
  const pins = pinFields(scaffoldPins(updated));
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

export async function migrate(
  version: string,
  projectDir = process.cwd(),
  options: { skipInstall?: boolean } = {},
) {
  // Before any write, so a stop leaves the project untouched.
  assertAgentFilesCommitted(projectDir, managedAgentPaths(projectDir));
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

  const { peerDependencies, devDependencies } = resolveManagedDependencies({
    packageJson,
    features: detectFeatures(projectDir),
    fullyQualifiedVersion,
    workspacePackageNames,
  });

  console.log("Updating package.json...");
  await writePackage(
    projectDir,
    migratedPackageJson(packageJson, { peerDependencies, devDependencies }),
  );

  console.log("Removing legacy lint/format config files...");
  removeLegacyLintFormatFiles(projectDir);
  console.log("Overwriting project root files...");
  const agentFiles = await writeAllGeneratedProjectFiles(projectDir);
  console.log("Removing compiler options TypeScript 7 dropped...");
  for (const file of migrateTsconfigFiles(projectDir)) {
    console.log(`  updated ${file}`);
  }
  if (migratePowerhouseConfig(projectDir)) {
    console.log(
      "Removed the scaffolded connect.instance defaults from powerhouse.config.json, so Vetra Studio picks its reactor client",
    );
  }
  console.log("Moving unversioned document models...");
  moveLegacyDocumentModels(projectDir);
  const project = buildTsMorphProject(projectDir);
  console.log("Fixing legacy import paths...");
  fixLegacyImportPaths(project, packageJson.name);
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
  await generateAll(project);
  await project.save();
}

function removeLegacyLintFormatFiles(projectDir: string) {
  for (const name of LEGACY_LINT_FORMAT_FILES) {
    rmSync(join(projectDir, name), { force: true });
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

function moveLegacyDocumentModels(projectDir: string) {
  const fileNamesToDelete = [
    "actions.ts",
    "hooks.ts",
    "module.ts",
    "index.ts",
    "utils.ts",
    "schema.graphql",
  ];
  const dirNamesToCopy = ["src", "gen"];
  const dirs = pipe(
    readdirSync(join(projectDir, "document-models"), { withFileTypes: true }),
    filter((entry) => entry.isDirectory()),
    filter(
      (dir) =>
        statSync(join(dir.parentPath, dir.name, `${dir.name}.json`), {
          throwIfNoEntry: false,
        })?.isFile() ?? false,
    ),
    map((dir) => join(dir.parentPath, dir.name)),
  );

  for (const dirPath of dirs) {
    for (const name of fileNamesToDelete) {
      const filePath = join(dirPath, name);
      rmSync(filePath, { force: true });
    }
    const versionDirPath = join(dirPath, "v1");
    const versionDirExists =
      statSync(versionDirPath, { throwIfNoEntry: false })?.isDirectory() ??
      false;
    if (!versionDirExists) {
      mkdirSync(versionDirPath);
    }
    for (const dirName of dirNamesToCopy) {
      const srcDirPath = join(dirPath, dirName);
      const srcDirExists =
        statSync(srcDirPath, { throwIfNoEntry: false })?.isDirectory() ?? false;
      if (!srcDirExists) continue;
      const destDirPath = join(versionDirPath, dirName);
      cpSync(srcDirPath, destDirPath, {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
      rmSync(srcDirPath, {
        force: true,
        recursive: true,
      });
    }
  }
}
