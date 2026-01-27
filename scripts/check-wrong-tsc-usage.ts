#!/usr/bin/env tsx
import fg from "fast-glob";
import path from "node:path";
import { readPackage } from "read-pkg";

type PackageScripts = {
  packageName: string;
  scripts: {
    scriptName: string;
    script: string;
  }[];
}[];

async function main() {
  const packageJsonPaths = await fg("**/package.json", {
    cwd: process.cwd(),
    onlyFiles: true,
    absolute: true,
    ignore: [
      "package.json",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/lib/**",
      "**/__tests__/**",
    ],
  });
  const packageDirs = packageJsonPaths.map((p) => path.dirname(p));
  const packageScripts = await getPackageScripts(packageDirs);
  assertCorrectUsageOfTsc(packageScripts);
  process.exit(0);
}

async function getPackageScripts(
  packageDirs: string[],
): Promise<PackageScripts> {
  return await Promise.all(
    packageDirs.map(async (cwd) => {
      const packageJson = await readPackage({ cwd });
      const packageName = packageJson.name;
      const scripts = Object.entries(packageJson.scripts ?? {}).map(
        ([scriptName, script]) => ({ scriptName, script }),
      );
      return { packageName, scripts };
    }),
  );
}

function assertCorrectUsageOfTsc(packageScripts: PackageScripts) {
  for (const { packageName, scripts } of packageScripts) {
    for (const { scriptName, script } of scripts) {
      if (script.includes("tsc -b") || script.includes("tsc --build")) {
        console.error(
          `
          Package "${packageName}" has a script "${scriptName}" that makes incorrect use of tsc --build.
          The tsc --build command is meant to be invoked at the top level of the monorepo.
          Calling it here in your package will cause unexpected behavior in the CI pipeline, leading to inconsistent builds.
          To build just this individual package, run tsc without the --build flag
          To build this individual package and its dependencies during development, run tsc --build yourself, but do not place it in a script.
          `.trim(),
        );
        process.exit(1);
      }

      if (script.includes("tsc") && script !== "tsc") {
        console.warn(
          `
          [WARNING]: Package "${packageName}" contains a script "${scriptName}" which invokes tsc.
          This must be done very carefully, as it can cause inconsistent builds if this script runs in the CI pipeline.
          `.trim(),
        );
      }
    }
  }
}

await main();
