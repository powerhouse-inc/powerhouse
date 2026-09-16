// Regenerates upstream/ and test/upstream/ from an Activepieces tag. The only
// way those trees change; see UPSTREAM.md.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { builtinModules } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Project } from "ts-morph";

interface UpstreamPackage {
  dir: string;
  upstreamDir: string;
  specifier: string;
}

// Literal edits applied after the codemod and formatting; each must match
// exactly `count` times (default 1) or the sync fails.
interface Patch {
  file: string;
  find: string;
  replace: string;
  why: string;
  count?: number;
}

interface ManifestFile {
  path: string;
  upstream: string;
  sha256: string;
}

interface Manifest {
  repository: string;
  tag: string;
  commit: string;
  date: string;
  packages: Record<
    string,
    { upstreamDir: string; name: string; version: string }
  >;
  license: { upstream: string; sha256: string };
  files: ManifestFile[];
}

const PACKAGES: UpstreamPackage[] = [
  {
    dir: "framework",
    upstreamDir: "packages/pieces/framework",
    specifier: "@activepieces/pieces-framework",
  },
  {
    dir: "common",
    upstreamDir: "packages/pieces/common",
    specifier: "@activepieces/pieces-common",
  },
  {
    dir: "core-piece-types",
    upstreamDir: "packages/core/piece-types",
    specifier: "@activepieces/core-piece-types",
  },
  {
    dir: "core-utils",
    upstreamDir: "packages/core/utils",
    specifier: "@activepieces/core-utils",
  },
];

const PATCHES: Patch[] = [
  {
    file: "upstream/common/lib/http/core/fetch-http-client.ts",
    why: "@types/node 25: Buffer<ArrayBufferLike> is no longer a BodyInit",
    find: "        body: buffered,\n",
    replace: "        body: buffered as unknown as BodyInit,\n",
  },
  {
    file: "upstream/common/lib/http/core/fetch-http-client.ts",
    why: "prettier splits the ternary, moving the error off the @ts-expect-error line",
    find:
      "      // @ts-expect-error -- undici streams a Node web ReadableStream body; the DOM fetch types omit the fromWeb overload\n" +
      "      return isNil(response.body)\n" +
      "        ? Readable.from([])\n" +
      "        : Readable.fromWeb(response.body);\n",
    replace:
      "      // undici streams a Node web ReadableStream body; the DOM fetch types omit the fromWeb overload\n" +
      "      return isNil(response.body)\n" +
      "        ? Readable.from([])\n" +
      "        : Readable.fromWeb(\n" +
      "            response.body as unknown as Parameters<typeof Readable.fromWeb>[0],\n" +
      "          );\n",
  },
  {
    file: "upstream/framework/index.ts",
    why: "rolldown-plugin-dts drops `type` on a re-export of a merged const+type; export the value too",
    find: 'export type { SeekPage } from "../core-utils/index.js";\n',
    replace: 'export { SeekPage } from "../core-utils/index.js";\n',
  },
  {
    file: "upstream/framework/index.ts",
    why: "same for McpAuthConfig: move it from the type-only block to the value block",
    find:
      "  DEFAULT_CHAT_TIER_ID,\n" +
      '} from "../core-piece-types/index.js";\n' +
      "export type {\n" +
      "  McpAuthConfig,\n",
    replace:
      "  DEFAULT_CHAT_TIER_ID,\n" +
      "  McpAuthConfig,\n" +
      '} from "../core-piece-types/index.js";\n' +
      "export type {\n",
  },
  {
    file: "upstream/framework/lib/property/index.ts",
    why: "same for InputProperty",
    find: 'export type { InputProperty } from "./input/index.js";\n',
    replace: 'export { InputProperty } from "./input/index.js";\n',
  },
  {
    file: "test/upstream/framework/test/connection-identifier-flag.test.ts",
    why: "upstream never typechecks this test; createPiece requires authors",
    find: '    logoUrl: "https://example.com/logo.png",\n    auth,\n',
    replace:
      '    logoUrl: "https://example.com/logo.png",\n    authors: [],\n    auth,\n',
  },
  {
    file: "test/upstream/core-utils/test/ai-provider-health.test.ts",
    why: "upstream never typechecks this test; a reporter returns void, push returns number",
    find: "observedProviderFetch((signal) => signals.push(signal))",
    replace:
      "observedProviderFetch((signal) => {\n        signals.push(signal);\n      })",
    count: 3,
  },
];

// Upstream's bundler alias for mime-db; aliasing it is the piece build's job.
const SKIP_FILES = new Set(["mime-db-min.cjs"]);
const REPO_URL = "https://github.com/activepieces/activepieces.git";
const REPO_SLUG = "activepieces/activepieces";

const PKG_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const UPSTREAM_OUT = path.join(PKG_ROOT, "upstream");
const TEST_OUT = path.join(PKG_ROOT, "test", "upstream");
const LICENSE_FILE = path.join(PKG_ROOT, "LICENSE");
const ESLINT_CONFIG = path.join(
  PKG_ROOT,
  "scripts",
  "sync-upstream.eslint.config.mjs",
);

function parseArgs(argv: string[]): { tag: string; from?: string } {
  let tag: string | undefined;
  let from: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--tag") tag = argv[++i];
    else if (arg === "--from") from = argv[++i];
    else if (arg.startsWith("--tag=")) tag = arg.slice("--tag=".length);
    else if (arg.startsWith("--from=")) from = arg.slice("--from=".length);
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!tag) {
    throw new Error(
      "usage: pnpm sync-upstream -- --tag <activepieces tag> [--from <checkout>]",
    );
  }
  return { tag, from };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function sha256(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out.sort();
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function isTestFile(file: string): boolean {
  return /\.(spec|test)\.ts$/.test(file);
}

interface Tree {
  root: string;
  commit: string;
  date: string;
  cleanup: () => void;
}

function obtainTree(tag: string, from: string | undefined): Tree {
  if (from) {
    const root = path.resolve(from);
    const commit = git(root, "rev-parse", "HEAD");
    const tags = git(root, "tag", "--points-at", "HEAD").split("\n");
    if (!tags.includes(tag)) {
      throw new Error(`${root} is at ${commit}, which is not tagged ${tag}`);
    }
    const date = git(root, "log", "-1", "--format=%cI", "HEAD");
    return { root, commit, date, cleanup: () => undefined };
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "activepieces-"));
  execFileSync(
    "git",
    [
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      "--branch",
      tag,
      REPO_URL,
      root,
    ],
    { stdio: "inherit" },
  );
  git(root, "sparse-checkout", "set", ...PACKAGES.map((p) => p.upstreamDir));
  const commit = git(root, "rev-parse", "HEAD");
  const date = git(root, "log", "-1", "--format=%cI", "HEAD");
  return {
    root,
    commit,
    date,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function readVersion(pkgJsonPath: string): string {
  const parsed = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as {
    version?: unknown;
  };
  if (typeof parsed.version !== "string") {
    throw new Error(`no version in ${pkgJsonPath}`);
  }
  return parsed.version;
}

// Original absolute path -> vendored absolute path.
function planCopies(tree: Tree): Map<string, string> {
  const plan = new Map<string, string>();
  for (const pkg of PACKAGES) {
    const pkgRoot = path.join(tree.root, pkg.upstreamDir);
    const srcDir = path.join(pkgRoot, "src");
    for (const file of walk(srcDir)) {
      if (SKIP_FILES.has(path.basename(file))) continue;
      const rel = path.relative(srcDir, file);
      const dest = isTestFile(file)
        ? path.join(TEST_OUT, pkg.dir, "src", rel)
        : path.join(UPSTREAM_OUT, pkg.dir, rel);
      plan.set(file, dest);
    }
    const testDir = path.join(pkgRoot, "test");
    for (const file of walk(testDir)) {
      plan.set(
        file,
        path.join(TEST_OUT, pkg.dir, "test", path.relative(testDir, file)),
      );
    }
  }
  return plan;
}

function relativeSpecifier(fromFile: string, toFile: string): string {
  let rel = toPosix(path.relative(path.dirname(fromFile), toFile));
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel.replace(/\.tsx?$/, ".js");
}

function rewriteSpecifier(
  spec: string,
  origFile: string,
  destFile: string,
  plan: Map<string, string>,
): string {
  const bare = PACKAGES.find(
    (p) => spec === p.specifier || spec.startsWith(`${p.specifier}/`),
  );
  if (bare) {
    if (spec !== bare.specifier) {
      throw new Error(`deep import ${spec} in ${origFile} is not supported`);
    }
    return relativeSpecifier(
      destFile,
      path.join(UPSTREAM_OUT, bare.dir, "index.ts"),
    );
  }
  if (spec.startsWith(".")) {
    const base = path.resolve(path.dirname(origFile), spec);
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
    ];
    const hit = candidates.find((c) => plan.has(c));
    if (!hit) {
      throw new Error(`cannot resolve ${spec} from ${origFile}`);
    }
    return relativeSpecifier(destFile, plan.get(hit)!);
  }
  if (!spec.startsWith("node:") && builtinModules.includes(spec)) {
    return `node:${spec}`;
  }
  return spec;
}

function header(tag: string, upstreamPath: string, destFile: string): string {
  const license = toPosix(path.relative(path.dirname(destFile), LICENSE_FILE));
  return (
    `// Vendored from ${REPO_SLUG}@${tag} ${upstreamPath}. MIT; see ${license}.\n` +
    `// Generated by scripts/sync-upstream.mts — do not edit by hand.\n`
  );
}

function codemod(tree: Tree, tag: string, plan: Map<string, string>): void {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
  for (const [orig, dest] of plan) {
    if (!dest.endsWith(".ts")) continue;
    const sourceFile = project.addSourceFileAtPath(dest);
    const declarations = [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations(),
    ];
    for (const decl of declarations) {
      const spec = decl.getModuleSpecifierValue();
      if (spec === undefined) continue;
      const next = rewriteSpecifier(spec, orig, dest, plan);
      if (next !== spec) decl.setModuleSpecifier(next);
    }
    const upstreamPath = toPosix(path.relative(tree.root, orig));
    fs.writeFileSync(
      dest,
      header(tag, upstreamPath, dest) + sourceFile.getFullText(),
    );
  }
}

function applyPatches(): void {
  for (const patch of PATCHES) {
    const file = path.join(PKG_ROOT, patch.file);
    const text = fs.readFileSync(file, "utf8");
    const expected = patch.count ?? 1;
    const count = text.split(patch.find).length - 1;
    if (count !== expected) {
      throw new Error(
        `patch "${patch.why}" matched ${count} times in ${patch.file} (expected ${expected}); upstream changed, revisit it`,
      );
    }
    fs.writeFileSync(file, text.replaceAll(patch.find, patch.replace));
  }
}

function runEslintFix(): void {
  execFileSync(
    "pnpm",
    [
      "exec",
      "eslint",
      "--no-config-lookup",
      "--config",
      path.relative(PKG_ROOT, ESLINT_CONFIG),
      "--fix",
      "upstream",
      "test/upstream",
    ],
    { cwd: PKG_ROOT, stdio: "inherit" },
  );
}

function checkLicense(tree: Tree): { upstream: string; sha256: string } {
  const upstreamText = fs.readFileSync(path.join(tree.root, "LICENSE"), "utf8");
  const ours = fs.existsSync(LICENSE_FILE)
    ? fs.readFileSync(LICENSE_FILE, "utf8")
    : "";
  if (!ours.includes(upstreamText.trim())) {
    throw new Error(
      "LICENSE no longer carries the upstream MIT text verbatim; update it before syncing",
    );
  }
  return { upstream: "LICENSE", sha256: sha256(upstreamText) };
}

function writePackageJsonUpstream(manifest: Manifest): void {
  const file = path.join(PKG_ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
    string,
    unknown
  >;
  const packages: Record<string, string> = {};
  for (const p of PACKAGES) {
    packages[manifest.packages[p.dir].name] = manifest.packages[p.dir].version;
  }
  pkg.upstream = {
    repository: manifest.repository,
    tag: manifest.tag,
    commit: manifest.commit,
    packages,
  };
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

function main(): void {
  const { tag, from } = parseArgs(process.argv.slice(2));
  const tree = obtainTree(tag, from);
  try {
    const license = checkLicense(tree);
    const plan = planCopies(tree);

    fs.rmSync(UPSTREAM_OUT, { recursive: true, force: true });
    fs.rmSync(TEST_OUT, { recursive: true, force: true });

    const manifest: Manifest = {
      repository: `https://github.com/${REPO_SLUG}`,
      tag,
      commit: tree.commit,
      date: tree.date,
      packages: {},
      license,
      files: [],
    };
    for (const pkg of PACKAGES) {
      const pkgJson = path.join(tree.root, pkg.upstreamDir, "package.json");
      manifest.packages[pkg.dir] = {
        upstreamDir: pkg.upstreamDir,
        name: pkg.specifier,
        version: readVersion(pkgJson),
      };
    }
    for (const [orig, dest] of plan) {
      const bytes = fs.readFileSync(orig);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bytes);
      manifest.files.push({
        path: toPosix(path.relative(PKG_ROOT, dest)),
        upstream: toPosix(path.relative(tree.root, orig)),
        sha256: sha256(bytes),
      });
    }
    manifest.files.sort((a, b) => a.path.localeCompare(b.path));

    codemod(tree, tag, plan);
    fs.writeFileSync(
      path.join(UPSTREAM_OUT, "MANIFEST.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    runEslintFix();
    applyPatches();
    writePackageJsonUpstream(manifest);

    const sources = manifest.files.filter((f) =>
      f.path.startsWith("upstream/"),
    );
    const tests = manifest.files.length - sources.length;
    console.log(
      `synced ${REPO_SLUG}@${tag} (${tree.commit.slice(0, 12)}, ${tree.date}): ` +
        `${sources.length} source files, ${tests} test files, ${PATCHES.length} patches`,
    );
    for (const p of PACKAGES) {
      const m = manifest.packages[p.dir];
      console.log(`  ${m.name}@${m.version} <- ${m.upstreamDir}`);
    }
  } finally {
    tree.cleanup();
  }
}

main();
