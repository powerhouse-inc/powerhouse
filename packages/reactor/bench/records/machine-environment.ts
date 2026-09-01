import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus, hostname, platform, release } from "node:os";
import type { MachineEnvironment, StorageEngine } from "./benchmark-schema.js";

/**
 * The machine, read from the machine. Nothing here is a caller's opinion,
 * because an environment a caller can assert is an environment a caller can
 * get wrong.
 */
export function readMachineEnvironment(
  storage: StorageEngine,
): MachineEnvironment {
  const processors = cpus();
  const environment: MachineEnvironment = {
    host: hostname(),
    os: `${platform()} ${release()}`,
    cpu: processors.length > 0 ? processors[0].model : "unknown",
    node: process.version,
    reactorSha: readSha(),
    storage,
  };
  if (processors.length > 0) {
    environment.cores = processors.length;
  }
  return environment;
}

/**
 * A record stamped with a sha describes the code that ran only if the tree was
 * clean, so a dirty tree is a failure rather than a suffix on the sha.
 */
function readSha(): string {
  let sha: string;
  try {
    sha = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch (error) {
    throw new Error(
      `Could not read the commit this ran against: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return sha;
}

/**
 * Empty when the given directory is clean, ignoring the record files
 * themselves. The pathspec is resolved against the working directory, not the
 * repository root, so a caller running inside the package passes ".".
 *
 * The exclusions matter: recording one benchmark appends to BENCHMARKS.jsonl,
 * which would leave the tree dirty and refuse the next recording in the same
 * session. The sha describes the code that ran, and the record files are its
 * output rather than its input.
 */
export function dirtyPaths(directory: string, excluded: string[]): string[] {
  let output: string;
  try {
    output = execFileSync(
      "git",
      [
        "status",
        "--porcelain",
        "--",
        directory,
        ...excluded.map((path) => `:(exclude)${path}`),
      ],
      { encoding: "utf8" },
    );
  } catch (error) {
    throw new Error(
      `Could not check the working tree: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** The runner's own version, read from the installed package rather than named
 * by a caller: a version a caller asserts is a version a caller can get wrong. */
export function readPackageVersion(name: string): string {
  let raw: string;
  try {
    raw = readFileSync(`node_modules/${name}/package.json`, "utf8");
  } catch (error) {
    throw new Error(
      `Could not read the ${name} version: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const parsed = JSON.parse(raw) as { version?: string };
  if (typeof parsed.version !== "string") {
    throw new Error(`${name}'s package.json has no version`);
  }
  return parsed.version;
}
