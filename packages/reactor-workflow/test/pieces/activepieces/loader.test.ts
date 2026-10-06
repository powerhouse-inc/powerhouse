// A fetched bundle's own manifest (or a symlink inside it) must not point
// resolveEntry() at a file outside the bundle directory.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveEntry } from "../../../src/pieces/activepieces/loader.js";

/**
 * Windows grants symlink creation only with Developer Mode or elevation;
 * CI runners have the privilege, a stock dev machine may not. Probe once
 * so the symlink case skips with a reason instead of failing on EPERM.
 */
async function canCreateSymlinks(): Promise<boolean> {
  const probeDir = await mkdtemp(path.join(tmpdir(), "ap-symlink-probe-"));
  const target = path.join(probeDir, "target");
  try {
    await writeFile(target, "");
    await symlink(target, path.join(probeDir, "link"));
    return true;
  } catch {
    return false;
  } finally {
    await rm(probeDir, { recursive: true, force: true });
  }
}

const symlinksAvailable = await canCreateSymlinks();

describe("resolveEntry containment", () => {
  let root: string;
  let pieceDir: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "ap-loader-"));
    pieceDir = path.join(root, "piece");
    await mkdir(pieceDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeManifest(
    manifest: Record<string, unknown>,
  ): Promise<void> {
    await writeFile(
      path.join(pieceDir, "package.json"),
      JSON.stringify(manifest),
    );
  }

  it("resolves a declared main file inside the bundle", async () => {
    await writeManifest({ main: "index.js" });
    await writeFile(path.join(pieceDir, "index.js"), "module.exports = {};");

    expect(resolveEntry(pieceDir)).toBe(path.join(pieceDir, "index.js"));
  });

  it("falls through to a safe candidate when main escapes the bundle", async () => {
    await writeFile(path.join(root, "outside.js"), "module.exports = {};");
    await writeManifest({ main: "../outside.js" });
    await writeFile(path.join(pieceDir, "index.js"), "module.exports = {};");

    expect(resolveEntry(pieceDir)).toBe(path.join(pieceDir, "index.js"));
  });

  it("throws rather than resolve outside the bundle when nothing safe exists", async () => {
    await writeFile(path.join(root, "outside.js"), "module.exports = {};");
    await writeManifest({ main: "../outside.js" });

    expect(() => resolveEntry(pieceDir)).toThrow(/No entry file found/);
  });

  it.skipIf(!symlinksAvailable)(
    "rejects a symlink inside the bundle that resolves outside it",
    async () => {
      await writeFile(path.join(root, "outside.js"), "module.exports = {};");
      await symlink(
        path.join(root, "outside.js"),
        path.join(pieceDir, "link.js"),
      );
      await writeManifest({ main: "link.js" });

      expect(() => resolveEntry(pieceDir)).toThrow(/No entry file found/);
    },
  );
});
