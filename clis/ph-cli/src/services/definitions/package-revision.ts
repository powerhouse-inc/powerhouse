import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export const NON_INPUT_DIRECTORIES: readonly string[] = [
  "node_modules",
  ".git",
  ".ph",
  ".tsbuild",
  ".turbo",
  ".vite",
];

type PackageRevisionInput = {
  readonly packageRoot: string;
  readonly excludedDirectories?: readonly string[];
  readonly excludedDirectoryNames?: readonly string[];
  readonly respectGitignore?: boolean;
  readonly bindings: Readonly<Record<string, string>>;
};

export function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

function gitVisibleFiles(root: string): ReadonlySet<string> | undefined {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (listed.status !== 0) return undefined;
  return new Set(listed.stdout.split("\0").filter((path) => path !== ""));
}

function fileEntries(
  root: string,
  directory: string,
  excluded: ReadonlySet<string>,
  excludedNames: ReadonlySet<string>,
  visible: ReadonlySet<string> | undefined,
  into: string[],
): void {
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry);
    if (excludedNames.has(entry) || excluded.has(relative(root, path)))
      continue;
    const stats = statSync(path, { throwIfNoEntry: false });
    if (stats === undefined) continue;
    if (stats.isDirectory()) {
      fileEntries(root, path, excluded, excludedNames, visible, into);
      continue;
    }
    if (!stats.isFile()) continue;
    const packagePath = toPosixPath(relative(root, path));
    if (visible !== undefined && !visible.has(packagePath)) continue;
    const digest = createHash("sha256")
      .update(readFileSync(path))
      .digest("hex");
    into.push(`${packagePath} ${digest}`);
  }
}

export function computePackageRevision(
  input: PackageRevisionInput,
): `sha256:${string}` {
  const excluded = new Set(
    (input.excludedDirectories ?? []).map((directory) =>
      relative(input.packageRoot, resolve(input.packageRoot, directory)),
    ),
  );
  const entries: string[] = [];
  fileEntries(
    input.packageRoot,
    input.packageRoot,
    excluded,
    new Set(input.excludedDirectoryNames ?? NON_INPUT_DIRECTORIES),
    input.respectGitignore === true
      ? gitVisibleFiles(input.packageRoot)
      : undefined,
    entries,
  );
  for (const key of Object.keys(input.bindings).sort()) {
    entries.push(`binding:${key} ${input.bindings[key]}`);
  }
  return `sha256:${createHash("sha256").update(entries.join("\n")).digest("hex")}`;
}
