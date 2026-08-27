import { execSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { extract, list } from "tar";
import { afterAll, describe, expect, it } from "vitest";
import { packTarball } from "./pack.js";

// The other suites used to build their fixtures by shelling out to `npm pack`.
// packTarball replaced that (a full npm CLI boot per fixture was timing tests
// out on the Windows runner), which would otherwise cost the guarantee that
// what we hand verdaccio still looks like a real npm tarball. This test keeps
// that guarantee by packing the same input both ways and comparing what comes
// back out of the extraction path src/cdn.ts uses.
//
// It is the one place that still spawns npm, and it does so once.

const MANIFEST = { name: "cmp-pkg", version: "1.0.0", description: "t" };
const FILES = {
  "index.js": "module.exports = 1;",
  "dist/nested/asset.wasm": "\0asm-ish",
  "powerhouse.manifest.json": JSON.stringify({ name: "cmp-pkg" }),
};

const scratch: string[] = [];
function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/** The source tree both packers are pointed at. */
function seed(): string {
  const dir = tmp("pack-src-");
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(MANIFEST));
  for (const [rel, content] of Object.entries(FILES)) {
    const target = path.join(dir, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return dir;
}

/** Tar header fields that decide how an entry lands on disk.
 *
 *  Deliberately not mtime: npm stamps every entry with a fixed constant,
 *  node-tar records the real one. That differs, but it is the same on every
 *  host, so it cannot make a fixture behave differently across platforms —
 *  which is the drift this comparison exists to catch. */
async function headers(
  tarball: Buffer,
): Promise<{ path: string; type: string; size: number; mode: string }[]> {
  const file = path.join(tmp("pack-tgz-"), "p.tgz");
  writeFileSync(file, tarball);
  const rows: { path: string; type: string; size: number; mode: string }[] = [];
  await list({
    file,
    onReadEntry: (e) =>
      rows.push({
        path: e.path,
        type: String(e.type),
        size: e.size,
        mode: (e.mode ?? 0).toString(8),
      }),
  });
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

/** Extract the way src/cdn.ts does, then flatten to comparable entries. */
async function extractedTree(tarball: Buffer): Promise<[string, string][]> {
  const dir = tmp("pack-out-");
  const file = path.join(tmp("pack-tgz-"), "p.tgz");
  writeFileSync(file, tarball);
  await extract({ file, cwd: dir, strip: 1 });

  const entries: [string, string][] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const rel = path.relative(dir, full).split(path.sep).join("/");
        entries.push([rel, readFileSync(full, "utf-8")]);
      }
    }
  };
  walk(dir);
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

describe("packTarball", () => {
  it("extracts to the same tree as a tarball built by `npm pack`", async () => {
    const src = seed();
    const name = execSync("npm pack --pack-destination .", {
      cwd: src,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const fromNpm = readFileSync(path.join(src, name));

    const mine = packTarball(MANIFEST, FILES);

    // Headers first: mode in particular, which decides the permissions
    // extraction writes and is invisible once the files are on a Windows disk.
    expect(await headers(mine)).toEqual(await headers(fromNpm));

    const ours = await extractedTree(mine);
    const theirs = await extractedTree(fromNpm);
    expect(ours).toEqual(theirs);

    // `.tgz` implies gzip and npm always compresses; node-tar reads either,
    // so nothing downstream would notice a plain tar.
    expect([...mine.subarray(0, 2)]).toEqual([0x1f, 0x8b]);

    // Guard against both sides being trivially empty.
    expect(ours.map(([rel]) => rel)).toContain("package.json");
    expect(ours.map(([rel]) => rel)).toContain("dist/nested/asset.wasm");
  });

  it("nests every entry under package/, which extract({ strip: 1 }) requires", async () => {
    const dir = tmp("pack-nostrip-");
    const file = path.join(tmp("pack-tgz-"), "p.tgz");
    writeFileSync(file, packTarball(MANIFEST, FILES));
    await extract({ file, cwd: dir });
    expect(readdirSync(dir)).toEqual(["package"]);
  });
});
