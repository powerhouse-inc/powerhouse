import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getVersion } from "../src/get-version.js";
import { runModelCheck } from "../src/services/model/check.js";
import {
  publishedFiles,
  revisionFiles,
  writeReleaseApproval,
} from "../src/services/release/files.js";
import { packageRevision } from "../src/services/release/revision.js";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

/** A package in a temp directory whose path has spaces in it. */
function packageWith(files: Readonly<Record<string, string>>): string {
  const parent = realpathSync.native(
    mkdtempSync(join(tmpdir(), "ph release ")),
  );
  roots.push(parent);
  const root = join(parent, "my package");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const FILES = {
  "package.json": JSON.stringify({
    name: "p",
    version: "1.0.0",
    files: ["/dist"],
  }),
  "src/a file.ts": "a",
  "src/deep/b.ts": "b",
  "dist/index.js": "built",
  "node_modules/x/index.js": "dependency",
  "src/node_modules/y.js": "nested dependency",
  ".ph/build/release-approval.json": "{}",
  "local.env": "secret",
  ".gitignore": "local.env\n",
  ".dist.ph-stage-abc/index.js": "stage",
};

function approve(root: string): void {
  writeReleaseApproval(root, {
    kind: "powerhouse.release-approval",
    formatVersion: 1,
    phCliVersion: getVersion(),
    outDir: "dist",
    packageRevision: {
      digest: packageRevision(revisionFiles(root, ["dist"]), {
        "ph-cli": getVersion(),
      }),
      excluded: [],
    },
    publishedFiles: publishedFiles(root),
    report: { profile: "release", status: "ok", definitions: [] },
    scalars: [],
    hostValidation: { completed: true, findings: [] },
  });
}

async function prepack(root: string) {
  let stdout = "";
  let stderr = "";
  const code = await runModelCheck(
    { json: true, prepack: true },
    {
      projectRoot: root,
      streams: {
        out: (text) => void (stdout += text),
        err: (text) => void (stderr += text),
      },
    },
  );
  return { code, stdout, stderr };
}

describe("revisionFiles", () => {
  it("reads every file outside the excluded ones when the package is not in a work tree", () => {
    const root = packageWith(FILES);
    symlinkSync("src/a file.ts", join(root, "link"));

    expect(revisionFiles(root, ["dist"])).toEqual([
      { path: ".gitignore", sha256: sha("local.env\n") },
      { path: "link", sha256: sha("src/a file.ts") },
      { path: "local.env", sha256: sha("secret") },
      { path: "package.json", sha256: sha(FILES["package.json"]) },
      { path: "src/a file.ts", sha256: sha("a") },
      { path: "src/deep/b.ts", sha256: sha("b") },
    ]);
  });

  it("leaves out what git ignores inside a work tree, and a tracked file that is gone", () => {
    const root = packageWith(FILES);
    symlinkSync("src/a file.ts", join(root, "link"));
    const git = (...args: string[]) =>
      expect(spawnSync("git", args, { cwd: root }).status).toBe(0);
    git("init", "--quiet");
    git("add", "src/deep/b.ts");
    rmSync(join(root, "src", "deep", "b.ts"));

    expect(revisionFiles(root, ["dist"])).toEqual([
      { path: ".gitignore", sha256: sha("local.env\n") },
      { path: "link", sha256: sha("src/a file.ts") },
      { path: "package.json", sha256: sha(FILES["package.json"]) },
      { path: "src/a file.ts", sha256: sha("a") },
    ]);
  });

  it("names a package's files from the package, inside a larger work tree", () => {
    const root = packageWith(FILES);
    writeFileSync(join(dirname(root), "other.ts"), "sibling");
    expect(
      spawnSync("git", ["init", "--quiet"], { cwd: dirname(root) }).status,
    ).toBe(0);

    expect(revisionFiles(root, ["dist"])).toEqual([
      { path: ".gitignore", sha256: sha("local.env\n") },
      { path: "package.json", sha256: sha(FILES["package.json"]) },
      { path: "src/a file.ts", sha256: sha("a") },
      { path: "src/deep/b.ts", sha256: sha("b") },
    ]);
  });
});

describe("publishedFiles", () => {
  it("lists what npm pack publishes, with digests", () => {
    const root = packageWith({ ...FILES, "dist/sub dir/c.js": "c" });

    expect(publishedFiles(root)).toEqual([
      { path: "dist/index.js", sha256: sha("built") },
      { path: "dist/sub dir/c.js", sha256: sha("c") },
      { path: "package.json", sha256: sha(FILES["package.json"]) },
    ]);
  });

  it("covers every .ph file npm packs but the approval itself", () => {
    const root = packageWith({
      "package.json": JSON.stringify({ name: "p", version: "1.0.0" }),
      ".ph/build/release-approval.json": "{}",
      ".ph/payload.js": "payload",
      "index.js": "i",
    });

    expect(publishedFiles(root)).toEqual([
      { path: ".ph/payload.js", sha256: sha("payload") },
      { path: "index.js", sha256: sha("i") },
      {
        path: "package.json",
        sha256: sha(JSON.stringify({ name: "p", version: "1.0.0" })),
      },
    ]);
  });

  it.each([
    { files: ["dist", ".ph"], what: "lists .ph" },
    { files: undefined, what: "has no files list" },
  ])(
    "makes the approval stale when a packed .ph file changes, for a package that $what",
    async ({ files }) => {
      const root = packageWith({
        "package.json": JSON.stringify({ name: "p", version: "1.0.0", files }),
        "dist/index.js": "export const a = 1;\n",
        ".ph/payload.js": "old payload\n",
      });
      approve(root);
      expect(JSON.parse((await prepack(root)).stdout)).toEqual({
        decision: "approved",
        reasons: [],
      });

      writeFileSync(join(root, ".ph/payload.js"), "changed after approval\n");

      expect(await prepack(root)).toEqual({
        code: 1,
        stdout: `${JSON.stringify({
          decision: "stale",
          reasons: [
            "1 published file changed since the approval was made: .ph/payload.js",
          ],
        })}\n`,
        stderr: "",
      });
    },
  );

  it("refuses to list another package that an .npmrc workspace selects, even with the same name and version", () => {
    const identity = JSON.stringify({
      name: "@review/root",
      version: "1.0.0",
      files: ["index.js"],
    });
    const root = packageWith({
      "package.json": JSON.stringify({
        ...JSON.parse(identity),
        workspaces: ["other"],
      }),
      "index.js": "ROOT\n",
      "other/package.json": identity,
      "other/index.js": "OTHER\n",
      ".npmrc": "workspace=other\n",
    });

    expect(() => publishedFiles(root)).toThrow(
      `npm's configuration (a workspace setting in the environment or an .npmrc) selects a package other than the one in ${root}; the release approval covers that package only.`,
    );
  });
});

describe.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "a package outside a git work tree with a directory it cannot read",
  () => {
    const PACKAGE = {
      "package.json": JSON.stringify({
        name: "p",
        version: "1.0.0",
        files: ["index.js"],
      }),
      "index.js": "i",
    };

    it("cannot be checked by ph model check --prepack, which names the directory", async () => {
      const root = packageWith({
        ...PACKAGE,
        "docs/source.txt": "part of revision\n",
      });
      approve(root);
      const docs = join(root, "docs");
      chmodSync(docs, 0o000);

      let result: Awaited<ReturnType<typeof prepack>>;
      try {
        result = await prepack(root);
      } finally {
        chmodSync(docs, 0o755);
      }

      expect(result).toEqual({
        code: 2,
        stdout: "",
        stderr: `ph model check --prepack could not run: the package directory docs cannot be read: EACCES: permission denied, scandir '${docs}'\n`,
      });
    });

    it("leaves an unreadable directory inside an excluded path out of the revision", () => {
      const root = packageWith({
        ...PACKAGE,
        "dist/private/secret": "secret\n",
      });
      const secret = join(root, "dist", "private");
      chmodSync(secret, 0o000);

      try {
        expect(revisionFiles(root, ["dist"]).map(({ path }) => path)).toEqual([
          "index.js",
          "package.json",
        ]);
      } finally {
        chmodSync(secret, 0o755);
      }
    });
  },
);
