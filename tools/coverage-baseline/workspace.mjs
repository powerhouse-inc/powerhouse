import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  constants,
  cpSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { stopScenarioProcesses } from "./processes.mjs";

export function inputDigest(root, excludedOutput) {
  const files = execFileSync(
    "git",
    [
      "-C",
      root,
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  const digest = createHash("sha256");
  for (const path of [...new Set(files.split("\0").filter(Boolean))].sort()) {
    if (
      excludedOutput &&
      (path === excludedOutput || path.startsWith(excludedOutput + "/"))
    )
      continue;
    const file = join(root, path);
    const stat = lstatSync(file, { throwIfNoEntry: false });
    digest.update(path + "\0");
    if (!stat) digest.update("deleted\0");
    else if (stat.isSymbolicLink())
      digest.update("link\0" + readlinkSync(file));
    else if (stat.isFile()) {
      digest.update(`file:${stat.mode & 0o111}\0`);
      digest.update(createHash("sha256").update(readFileSync(file)).digest());
    } else throw new Error(`Unexpected Git-visible input type: ${path}`);
    digest.update("\0");
  }
  return digest.digest("hex");
}

// `excluded` holds absolute paths left out of the copy: the run's output and nested worktrees.
export function copyScenario(source, destination, excluded) {
  const inside = (path, base) => path === base || path.startsWith(base + sep);
  if (excluded.some((path) => inside(source, path))) return;
  if (process.platform !== "darwin") {
    cpSync(source, destination, {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
      filter: (path) => !excluded.some((item) => inside(path, item)),
    });
  } else if (
    excluded.some((path) => path.startsWith(source + sep)) &&
    lstatSync(source).isDirectory()
  ) {
    mkdirSync(destination, { recursive: true });
    for (const name of readdirSync(source))
      copyScenario(join(source, name), join(destination, name), excluded);
  } else execFileSync("/bin/cp", ["-cpR", source, destination]);
}

export function nestedWorktrees(root) {
  return execFileSync("git", ["-C", root, "worktree", "list", "--porcelain"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length))
    .filter((path) => path.startsWith(root + sep));
}

export async function disposeWorkspace(
  workspace,
  expectedDigest,
  excludedOutput,
) {
  const started = performance.now();
  const cleanup = await stopScenarioProcesses(workspace.root);
  const receipt = { root: workspace.root, cleanup, deleted: false };
  try {
    receipt.inputValid =
      inputDigest(workspace.root, excludedOutput) === expectedDigest;
  } catch (error) {
    receipt.inputValid = false;
    receipt.error = String(error);
  }
  if (cleanup.valid) {
    try {
      rmSync(workspace.root, { recursive: true, force: true });
      receipt.deleted = true;
    } catch (error) {
      receipt.error = String(error);
    }
  }
  receipt.durationMs = performance.now() - started;
  return receipt;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const receipt = await disposeWorkspace(
    input.workspace,
    input.inputDigest,
    input.excludedOutput,
  );
  writeFileSync(input.receipt, JSON.stringify(receipt, null, 2) + "\n");
  if (!receipt.deleted) process.exitCode = 1;
}
