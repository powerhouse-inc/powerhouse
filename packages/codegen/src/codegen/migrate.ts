import {
  externalDevDependencies,
  FEATURE_DEPENDENCIES,
  getPackageManagerAtPowerhouseProjectDirPath,
  getPowerhouseProjectInstallCommand,
  LEGACY_LINT_FORMAT_DEPENDENCIES,
  LEGACY_LINT_FORMAT_FILES,
  packageJsonExports,
  packageScripts,
  PEER_EXTERNAL_DEPENDENCIES,
  runCmd,
  VERSIONED_DEV_DEPENDENCIES,
  VERSIONED_PEER_DEPENDENCIES,
} from "@powerhousedao/shared/clis";
import console from "console";
import { writeAllGeneratedProjectFiles } from "file-builders";
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
import type { Project } from "ts-morph";
import { buildTsMorphProject } from "utils";
import { writePackage } from "write-package";
import { detectFeatures } from "./features.js";
import { generateAll } from "./generate.js";
import { sortByKey } from "./utils.js";

/* Uses the npm cli's fetch function to get the version for a specified tag */
export async function getFullyQualifiedWorkspacePackageVersion(
  versionOrTag: string,
) {
  const isTag =
    versionOrTag === "latest" ||
    versionOrTag === "staging" ||
    versionOrTag === "dev";

  if (!isTag) return versionOrTag;
  const result = (await npmFetch.json(
    `${WORKSPACE_PACKAGES[0].manifest.name!}`,
  )) as { "dist-tags": Record<"latest" | "staging" | "dev", string> };
  return result["dist-tags"][versionOrTag];
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
      const namedImports = map(
        importStatement.getNamedImports(),
        (importSpecifier) => importSpecifier.getText(),
      );
      const moduleSpecifier = importStatement.getModuleSpecifier();
      const moduleSpecifierText = moduleSpecifier.getLiteralText();
      // remove usage of the old `package-name/` style paths
      if (moduleSpecifierText.includes(packageName)) {
        moduleSpecifier.setLiteralValue(
          moduleSpecifierText.replace(`${packageName}/`, ""),
        );
      }
      // I saw this invalid import enough that it seemed worthwhile to fix it here
      if (namedImports.includes("generateMock")) {
        moduleSpecifier.setLiteralValue("document-model");
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

export async function migrate(version: string, projectDir = process.cwd()) {
  const fullyQualifiedVersion =
    await getFullyQualifiedWorkspacePackageVersion(version);

  const packageJson = await readPackage({
    cwd: projectDir,
    normalize: false,
  });
  const exports = packageJsonExports;
  const scripts = merge(packageJson.scripts, packageScripts);
  const workspacePackageNames = filter(
    map(WORKSPACE_PACKAGES, prop("manifest", "name")),
    isTruthy,
  );

  const features = detectFeatures(projectDir);
  const featurePeerVersioned = features.flatMap(
    (f) => FEATURE_DEPENDENCIES[f].peerVersioned as readonly string[],
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
  const managedDevVersioned = [
    ...VERSIONED_DEV_DEPENDENCIES,
    ...managedPeerVersioned,
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

  console.log("Updating package.json...");
  const updatedPackageJson: PackageJson = {
    ...packageJson,
    type: packageJson.type ?? "module",
    sideEffects: packageJson.sideEffects ?? false,
    files: packageJson.files ?? ["/dist"],
    exports,
    scripts,
    peerDependencies,
    devDependencies,
  } as PackageJson;
  // Runtime `dependencies` block is no longer emitted — the bundled dist
  // self-contains everything except the declared peers.
  delete (updatedPackageJson as { dependencies?: unknown }).dependencies;
  await writePackage(projectDir, updatedPackageJson);

  console.log("Removing legacy lint/format config files...");
  removeLegacyLintFormatFiles(projectDir);
  console.log("Overwriting project root files...");
  await writeAllGeneratedProjectFiles(projectDir);
  console.log("Moving unversioned document models...");
  moveLegacyDocumentModels(projectDir);
  const project = buildTsMorphProject(projectDir);
  console.log("Fixing legacy import paths...");
  fixLegacyImportPaths(project, packageJson.name);
  console.log("Installing dependencies...");
  await installProjectDependencies(projectDir);
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
  const installCommand = await getPowerhouseProjectInstallCommand(agent);
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
