import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { create } from "tar";

/**
 * Builds an npm-layout tarball in memory: every entry is nested under
 * `package/`, which is what `extract({ strip: 1 })` in src/cdn.ts expects.
 *
 * This replaces shelling out to `npm pack`. Each of those spawned a full npm
 * CLI — ~600ms on an idle dev machine, several seconds on a contended Windows
 * runner — and the tests making three of them in a row timed out in CI.
 */
export function packTarball(
  manifest: Record<string, unknown>,
  files: Record<string, string> = {},
): Buffer {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ph-registry-pack-"));
  try {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest));
    for (const [relPath, content] of Object.entries(files)) {
      const target = path.join(dir, relPath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    // In sync mode the whole archive is buffered in the stream by the time
    // create() returns, so it can be drained without an await.
    const stream = create(
      {
        sync: true,
        gzip: true,
        cwd: dir,
        prefix: "package",
        // Normalises the headers the way npm does: mode 0644, no uid/gid.
        // Without it node-tar records the temp file's own mode, which is 0666
        // on Windows against 0644 on Linux — the fixture would then differ by
        // build host. tests/pack.test.ts pins this against real npm output.
        portable: true,
      },
      ["package.json", ...Object.keys(files)],
    );
    const chunks: Buffer[] = [];
    let chunk: Buffer | null;
    while ((chunk = stream.read() as Buffer | null) !== null) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
