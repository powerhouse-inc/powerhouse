import { execa } from "execa";
import { flatMap, join, map, pipe } from "remeda";
import type { FilePath } from "./types.js";

const makeExcludeGlob = (dir: string) => ["--glob", `!**/${dir}/**`] as const;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const makeSearchPattern = (strings: readonly string[]) =>
  pipe(strings, map(escapeRegex), join("|"));

const defaultIgnoredDirs = [
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
  "scripts",
] as const;

export const findFilesWithClasses = async (
  classes: readonly string[],
  cwd = process.cwd(),
  ignoredDirs = defaultIgnoredDirs,
): Promise<FilePath[]> => {
  const excludeGlobs = flatMap(ignoredDirs, makeExcludeGlob);
  const searchPattern = makeSearchPattern(classes);
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
