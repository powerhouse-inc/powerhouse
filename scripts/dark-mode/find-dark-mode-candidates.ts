import { execa } from "execa";
import { keys } from "remeda";
import { allMappings } from "./mappings.js";
import type { FilePath } from "./types.js";

const ignoredDirs = [
  "node_modules",
  "coverage",
  "dist",
  "ts-build",
  "storybook-static",
  ".vite",
  ".nx",
  "build",
  ".tsbuild",
  ".docusaurus",
  ".ph",
  "prisma",
  ".out",
  "test-output",
  ".test-output",
  "test",
  "flaky",
  "scripts"
] as const;

const excludeGlobs = ignoredDirs.flatMap(
  (dir) => ["--glob", `!**/${dir}/**`] as const,
);

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const makeClassSearchPattern = (classes: readonly string[]) => {
  if (classes.length === 0) {
    throw new Error("Cannot build search pattern from an empty class list.");
  }
  return classes.map(escapeRegex).join("|");
};

const mapKeys = keys(allMappings);
console.log({ mapKeys });
const searchPattern = makeClassSearchPattern(mapKeys);

console.log({ searchPattern });

/**

 * Finds candidate files that contain at least one mapped Tailwind class.

 *

 * Uses ripgrep content search first so ts-morph only opens files that are

 * likely to require migration.

 */

export const findDarkModeCandidates = async (
  cwd = process.cwd(),
): Promise<FilePath[]> => {
  const args = [
    "--files-with-matches",
    "--no-messages",
    "--glob",
    "*.ts",
    "--glob",
    "*.tsx",
    ...excludeGlobs,
    searchPattern,
    ".",
  ];

  const result = await execa("rg", args, {
    cwd,
    reject: false,
    stdout: ["pipe", "inherit"],
    stderr: "inherit",
  });

  return result.stdout.split("\n").filter(Boolean);
};
