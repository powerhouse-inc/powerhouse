import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const selected = (path, inputs) =>
  inputs.some(
    (input) => input === "." || path === input || path.startsWith(`${input}/`),
  );

export function remainingTime(deadline = Infinity) {
  const remaining = deadline - performance.now();
  if (remaining <= 0)
    throw Object.assign(new Error("Verification deadline expired"), {
      code: "VERIFICATION_TIMEOUT",
    });
  return remaining;
}

function git(root, args, deadline = Infinity) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    timeout: Math.ceil(Math.min(30_000, remainingTime(deadline))),
    killSignal: "SIGKILL",
    maxBuffer: 32 * 1024 * 1024,
  });
  remainingTime(deadline);
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr.trim());
  }
  return result.stdout;
}

export function repository(root, deadline = Infinity) {
  const canonical = realpathSync(root);
  if (
    realpathSync(
      git(canonical, ["rev-parse", "--show-toplevel"], deadline).trim(),
    ) !== canonical
  ) {
    throw new Error("--root must name a repository checkout root");
  }
  return canonical;
}

function localPath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((part) => part === ".." || part === ".git")
  )
    throw new Error(`Expected a repository-relative path: ${path}`);
  const normalized = path.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!normalized) throw new Error("Use . for the checkout root");
  return normalized;
}

function canonicalDestination(path, depth = 0) {
  if (depth > 40) throw new Error(`Too many source symlinks: ${path}`);
  let parent = resolve(path);
  const tail = [];
  for (;;) {
    try {
      if (lstatSync(parent).isSymbolicLink()) {
        return canonicalDestination(
          resolve(dirname(parent), readlinkSync(parent), ...tail),
          depth + 1,
        );
      }
      return resolve(realpathSync(parent), ...tail);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      tail.unshift(relative(dirname(parent), parent));
      parent = dirname(parent);
    }
  }
}

const within = (parent, path) =>
  path === parent || path.startsWith(`${parent}${sep}`);

export function checkoutPath(root, value = ".") {
  const path = resolve(root, localPath(value));
  if (!within(root, canonicalDestination(path)))
    throw new Error(`Path escapes the checkout: ${value}`);
  return path;
}

export function evidenceDirectory(root, path) {
  if (!isAbsolute(path))
    throw new Error("Evidence requires an absolute path outside checkouts");
  const destination = canonicalDestination(path);
  const worktrees = git(root, ["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => canonicalDestination(line.slice(9)));
  if (worktrees.some((worktree) => within(worktree, destination))) {
    throw new Error(
      "Evidence must be outside all repository worktrees and their cleanup targets",
    );
  }
  let parent = destination;
  while (!existsSync(parent)) parent = dirname(parent);
  const enclosing = spawnSync(
    "git",
    ["-C", parent, "rev-parse", "--show-toplevel"],
    {
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  if (enclosing.status === 0)
    throw new Error("Evidence must be outside Git checkouts");
  return destination;
}

function inventory(root, inputs, addedPaths, deadline = Infinity) {
  const head = git(root, ["rev-parse", "HEAD"], deadline).trim();
  const baseline = git(
    root,
    ["ls-tree", "-r", "-z", "--name-only", "HEAD"],
    deadline,
  )
    .split("\0")
    .filter(Boolean);
  const indexed = git(root, ["ls-files", "--cached", "-z"], deadline)
    .split("\0")
    .filter(Boolean);
  const untracked = git(
    root,
    ["ls-files", "--others", "--exclude-standard", "-z"],
    deadline,
  )
    .split("\0")
    .filter(Boolean);
  const allowed = new Set(addedPaths);
  const unexpected = [...indexed, ...untracked].filter(
    (path) =>
      selected(path, inputs) && !baseline.includes(path) && !allowed.has(path),
  );
  if (unexpected.length)
    throw new Error(
      `Undeclared new inputs: ${[...new Set(unexpected)].join(", ")}. Capture them with --untracked.`,
    );
  const paths = [...new Set([...baseline, ...indexed, ...addedPaths])]
    .filter((path) => selected(path, inputs))
    .sort();
  const entries = paths.map((path) => {
    remainingTime(deadline);
    const absolute = resolve(root, path);
    if (!within(root, canonicalDestination(dirname(absolute)))) {
      throw new Error(`Input parent escapes the checkout: ${path}`);
    }
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch (error) {
      if (error.code === "ENOENT") return { path, kind: "absent" };
      throw error;
    }
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(absolute);
      if (
        !within(root, canonicalDestination(resolve(dirname(absolute), target)))
      ) {
        throw new Error(`Source symlink escapes the checkout: ${path}`);
      }
      return { path, kind: "symlink", target };
    }
    if (!stat.isFile()) throw new Error(`Unsupported source input: ${path}`);
    return {
      path,
      kind: "file",
      executable: Boolean(stat.mode & 0o111),
      sha256: hash(readFileSync(absolute)),
    };
  });
  if (git(root, ["rev-parse", "HEAD"], deadline).trim() !== head)
    throw new Error("HEAD changed during source capture");
  return { head, entries };
}

function fingerprint(snapshot) {
  return hash(
    JSON.stringify([
      snapshot.head,
      snapshot.inputs,
      snapshot.addedPaths,
      snapshot.entries,
    ]),
  );
}

export function captureContext({
  root,
  inputs = ["."],
  untracked = [],
  targets = [],
  outputs = [],
  evidence,
}) {
  root = repository(root);
  inputs = [...new Set(inputs.map(localPath))].sort();
  const declared = untracked.map(localPath);
  const headPaths = new Set(
    git(root, ["ls-tree", "-r", "-z", "--name-only", "HEAD"]).split("\0"),
  );
  const indexed = git(root, ["ls-files", "--cached", "-z"])
    .split("\0")
    .filter(Boolean);
  const newPaths = git(root, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .split("\0")
    .filter(Boolean);
  const stagedAdditions = indexed.filter((path) => !headPaths.has(path));
  const newInputs = [...stagedAdditions, ...newPaths];
  const addedPaths = [
    ...new Set([
      ...stagedAdditions.filter((path) => selected(path, inputs)),
      ...newPaths.filter(
        (path) => selected(path, declared) && selected(path, inputs),
      ),
    ]),
  ].sort();
  for (const path of declared) {
    if (
      newInputs.some(
        (file) => selected(file, [path]) && !selected(file, inputs),
      )
    )
      throw new Error(
        `Declared untracked files are outside captured inputs: ${path}`,
      );
    if (
      !newPaths.some((file) => selected(file, [path])) &&
      !indexed.some((file) => selected(file, [path]))
    ) {
      throw new Error(`Declared untracked input does not exist: ${path}`);
    }
  }
  targets = targets.map(localPath);
  outputs = outputs.map(localPath);
  const first = inventory(root, inputs, addedPaths);
  if (!first.entries.length) throw new Error("No source inputs matched");
  for (const target of targets) {
    if (!first.entries.some((entry) => entry.path === target))
      throw new Error(`Target is not a captured input: ${target}`);
  }
  const second = inventory(root, inputs, addedPaths);
  if (JSON.stringify(first) !== JSON.stringify(second))
    throw new Error("Source changed during capture");
  const snapshot = {
    version: 1,
    ...first,
    inputs,
    addedPaths,
    targets,
    requiredOutputs: outputs,
    originalRoot: root,
    capturedAt: new Date().toISOString(),
    evidenceDirectory: evidenceDirectory(root, evidence),
  };
  return { ...snapshot, fingerprint: fingerprint(snapshot) };
}

export function readContext(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (
    value?.version !== 1 ||
    !/^[a-f0-9]{40,64}$/.test(value.head) ||
    !Array.isArray(value.inputs) ||
    !value.inputs.length ||
    !Array.isArray(value.addedPaths) ||
    !Array.isArray(value.entries) ||
    !Array.isArray(value.targets) ||
    !Array.isArray(value.requiredOutputs) ||
    typeof value.evidenceDirectory !== "string"
  )
    throw new Error("Invalid source context version or shape");
  [
    ...value.inputs,
    ...value.addedPaths,
    ...value.targets,
    ...value.requiredOutputs,
  ].forEach(localPath);
  for (const entry of value.entries) {
    localPath(entry.path);
    if (
      !["file", "symlink", "absent"].includes(entry.kind) ||
      (entry.kind === "file" &&
        (!/^[a-f0-9]{64}$/.test(entry.sha256) ||
          typeof entry.executable !== "boolean")) ||
      (entry.kind === "symlink" && typeof entry.target !== "string")
    )
      throw new Error("Invalid source entry");
  }
  if (fingerprint(value) !== value.fingerprint)
    throw new Error("Source context fingerprint is invalid");
  return value;
}

export function checkContext(root, snapshot, deadline = Infinity) {
  root = repository(root, deadline);
  if (git(root, ["rev-parse", "HEAD"], deadline).trim() !== snapshot.head) {
    throw new Error(`Wrong revision: expected ${snapshot.head}`);
  }
  const current = inventory(
    root,
    snapshot.inputs,
    snapshot.addedPaths,
    deadline,
  );
  if (fingerprint({ ...snapshot, ...current }) !== snapshot.fingerprint) {
    const old = new Map(
      snapshot.entries.map((entry) => [entry.path, JSON.stringify(entry)]),
    );
    const now = new Map(
      current.entries.map((entry) => [entry.path, JSON.stringify(entry)]),
    );
    const changed = [...new Set([...old.keys(), ...now.keys()])].filter(
      (path) => old.get(path) !== now.get(path),
    );
    throw new Error(`Source inputs changed: ${changed.join(", ")}`);
  }
  remainingTime(deadline);
  return {
    status: "matched",
    head: snapshot.head,
    fingerprint: snapshot.fingerprint,
  };
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: "string", default: process.cwd() },
      input: { type: "string", multiple: true },
      untracked: { type: "string", multiple: true },
      target: { type: "string", multiple: true },
      "required-output": { type: "string", multiple: true },
      "evidence-dir": { type: "string" },
      out: { type: "string" },
      context: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "agent-context.mjs capture --root PATH --input PATH --untracked PATH --out FILE --evidence-dir DIR\nagent-context.mjs check --root PATH --context FILE",
    );
    return;
  }
  if (positionals.length !== 1)
    throw new Error("Choose capture or check; use --help for usage");
  if (positionals[0] === "capture") {
    if (!values.out || !values["evidence-dir"])
      throw new Error(
        "Capture requires --out and --evidence-dir outside checkouts",
      );
    const root = repository(values.root);
    evidenceDirectory(root, dirname(resolve(values.out)));
    const context = captureContext({
      root,
      inputs: values.input,
      untracked: values.untracked,
      targets: values.target,
      outputs: values["required-output"],
      evidence: values["evidence-dir"],
    });
    mkdirSync(dirname(resolve(values.out)), { recursive: true });
    writeFileSync(values.out, `${JSON.stringify(context, null, 2)}\n`, {
      flag: "wx",
    });
    console.log(
      JSON.stringify({
        status: "captured",
        context: resolve(values.out),
        fingerprint: context.fingerprint,
      }),
    );
  } else if (positionals[0] === "check") {
    if (!values.context) throw new Error("Check requires --context");
    console.log(
      JSON.stringify(checkContext(values.root, readContext(values.context))),
    );
  } else throw new Error("Choose capture or check");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
