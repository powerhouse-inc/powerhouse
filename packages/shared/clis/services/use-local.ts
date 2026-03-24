import chalk from "chalk";
import path from "node:path";
import { readPackage } from "read-pkg";
import { writePackage } from "write-package";
import {
  ALL_POWERHOUSE_DEPENDENCIES,
  APPS_DEPENDENCIES,
  CLIS_DEPENDENCIES,
} from "../../constants.js";
import { directoryExists, logVersionUpdate, runCmd } from "../index.mjs";
export async function runUseLocal(monorepoPath: string, skipInstall?: boolean) {
  const monorepoDirExists = await directoryExists(monorepoPath);

  if (!monorepoDirExists) {
    throw new Error(
      "❌ No directory found at the powerhouse monorepo path you specified.",
    );
  }

  console.log(
    `\n▶️ Linking powerhouse dependencies to "${chalk.bold(monorepoPath)}...\n`,
  );

  const packageJson = await readPackage();

  if (packageJson.dependencies) {
    for (const [name, version] of Object.entries(packageJson.dependencies)) {
      if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
        const newVersion = buildPnpmLink(name, monorepoPath);
        packageJson.dependencies[name] = newVersion;
        logVersionUpdate({
          name,
          version,
          newVersion,
        });
      }
    }
  }

  if (packageJson.devDependencies) {
    for (const [name, version] of Object.entries(packageJson.devDependencies)) {
      if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
        const newVersion = buildPnpmLink(name, monorepoPath);
        packageJson.devDependencies[name] = newVersion;
        logVersionUpdate({
          name,
          version,
          newVersion,
        });
      }
    }
  }

  if (packageJson.optionalDependencies) {
    for (const [name, version] of Object.entries(
      packageJson.optionalDependencies,
    )) {
      if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
        const newVersion = buildPnpmLink(name, monorepoPath);
        packageJson.optionalDependencies[name] = newVersion;
        logVersionUpdate({
          name,
          version,
          newVersion,
        });
      }
    }
  }

  if (packageJson.peerDependencies) {
    for (const [name, version] of Object.entries(
      packageJson.peerDependencies,
    )) {
      if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
        const newVersion = buildPnpmLink(name, monorepoPath);
        packageJson.peerDependencies[name] = newVersion;
        logVersionUpdate({
          name,
          version,
          newVersion,
        });
      }
    }
  }

  await writePackage(packageJson);

  console.log(chalk.green(`\n✅ Project linked successfully\n`));

  if (!skipInstall) {
    console.log(`Installing linked dependencies with \`pnpm\`\n`);
    runCmd(`pnpm install`);
  }
}

function buildPnpmLink(packageName: string, monorepoPath: string) {
  const isCli = CLIS_DEPENDENCIES.includes(packageName);
  const isApp = APPS_DEPENDENCIES.includes(packageName);
  const packageDir = isCli ? "clis" : isApp ? "apps" : "packages";
  const packageNameWithoutNamespace = packageName.replace(
    "@powerhousedao/",
    "",
  );
  const packagePath = path
    .join(monorepoPath, packageDir, packageNameWithoutNamespace)
    .replace("analytics-engine-", "analytics-engine/");
  const pnpmLink = `file:${packagePath}`;

  return pnpmLink;
}
