#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import path from "node:path";

type FgOptions = {
  cwd?: string;
  onlyFiles?: boolean;
  absolute?: boolean;
  ignore?: string[];
};

type NormalizedPackageJson = {
  name: string;
  scripts?: Record<string, string>;
};

type ReadPkgOptions = {
  cwd?: string;
};

const fg = require("fast-glob") as (
  pattern: string,
  options?: FgOptions,
) => Promise<string[]>;

const readPackage = (
  require("read-pkg") as {
    readPackage: (options?: ReadPkgOptions) => Promise<NormalizedPackageJson>;
  }
).readPackage;

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
  const { errors, warnings } = getUsageOfTscErrorsAndWarnings(packageScripts);
  for (const error of errors) {
    console.error(error);
  }
  for (const warning of warnings) {
    console.warn(warning);
  }
  if (errors.length !== 0) {
    process.exit(1);
  }
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

function getUsageOfTscErrorsAndWarnings(packageScripts: PackageScripts) {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const { packageName, scripts } of packageScripts) {
    for (const { scriptName, script } of scripts) {
      if (script.includes("tsc -b") || script.includes("tsc --build")) {
        errors.push(
          `
[ERROR]:  Package "${packageName}" has a script "${scriptName}" that makes incorrect use of tsc --build.
          
          The tsc --build command is meant to be invoked at the top level of the monorepo.
          Calling it here in your package will cause unexpected behavior in the CI pipeline, 
          leading to inconsistent builds.

          To build just this individual package, run tsc without the --build flag.
          To build this individual package and its dependencies during development, 
          run tsc --build yourself, but do not place it in a script.
          `.trimStart(),
        );
      }

      if (script.includes("tsc") && script !== "tsc") {
        warnings.push(
          `
[WARNING]:  Package "${packageName}" contains a script "${scriptName}" which invokes tsc.
            This must be done very carefully, as it can cause inconsistent builds 
            if this script runs in the CI pipeline.
          `.trimStart(),
        );
      }
    }
  }

  return { errors, warnings };
}

await main();
