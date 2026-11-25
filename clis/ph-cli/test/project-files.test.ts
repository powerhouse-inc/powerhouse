import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import {
  readProjectFiles,
  restoreChanges,
  writeChanges,
} from "../src/services/project-files.js";

it("restores deleted source bytes and executable permissions when a conversion is rolled back", () => {
  const root = mkdtempSync(join(tmpdir(), "ph-write-rollback-"));
  const source = join(root, "script.ts");
  const contents = "#!/usr/bin/env node\nconsole.log('kept');\n";
  try {
    writeFileSync(source, contents);
    chmodSync(source, 0o755);
    const originalMode = statSync(source).mode & 0o777;
    const backup = writeChanges(root, [{ path: "script.ts", after: null }]);
    expect(existsSync(source)).toBe(false);
    restoreChanges(root, backup);
    expect(readFileSync(source, "utf8")).toBe(contents);
    expect(statSync(source).mode & 0o777).toBe(originalMode);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("leaves out what git ignores, from a project inside a larger work tree", () => {
  const parent = realpathSync.native(mkdtempSync(join(tmpdir(), "ph files ")));
  const root = join(parent, "my project");
  const files = {
    ".gitignore": "*.local.ts\n",
    "my project/.gitignore": "dist-stack/\n",
    "my project/src/a file.ts": "a",
    "my project/src/ünïcödé.ts": "u",
    "my project/src/secret.local.ts": "secret",
    "my project/dist-stack/src/a file.ts": "copy",
    "my project/node_modules/x/index.ts": "dependency",
  };
  const read = () => [...readProjectFiles(root, /\.ts$/).keys()].sort();
  const git = (...args: string[]) =>
    expect(spawnSync("git", args, { cwd: parent }).status).toBe(0);
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(parent, path)), { recursive: true });
      writeFileSync(join(parent, path), text);
    }
    // Outside a work tree, only the fixed directories are skipped.
    expect(read()).toEqual([
      "dist-stack/src/a file.ts",
      "src/a file.ts",
      "src/secret.local.ts",
      "src/ünïcödé.ts",
    ]);
    git("init", "--quiet");
    git("add", "my project/src/a file.ts");
    expect(read()).toEqual(["src/a file.ts", "src/ünïcödé.ts"]);
    // A project the repository ignores whole is read as outside one.
    writeFileSync(join(parent, ".gitignore"), "my project/\n");
    git("rm", "--cached", "--quiet", "my project/src/a file.ts");
    expect(read()).toEqual([
      "dist-stack/src/a file.ts",
      "src/a file.ts",
      "src/secret.local.ts",
      "src/ünïcödé.ts",
    ]);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
