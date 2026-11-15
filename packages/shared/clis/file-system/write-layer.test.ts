import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeFileEnsuringDir } from "./write-file-ensuring-dir.js";
import { projectFiles, recordWrites } from "./write-layer.js";

const dirs: string[] = [];

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-write-layer-test-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("projectFiles outside a recording", () => {
  it("writes and removes on disk", () => {
    const dir = makeDir();
    const file = join(dir, "nested/file.txt");
    projectFiles.writeSync(file, "one\n");
    expect(readFileSync(file, "utf-8")).toBe("one\n");
    expect(projectFiles.read(file)).toBe("one\n");
    expect(projectFiles.list(join(dir, "nested"))).toEqual(["file.txt"]);
    projectFiles.remove(join(dir, "nested"));
    expect(existsSync(file)).toBe(false);
    expect(projectFiles.read(file)).toBeUndefined();
    expect(projectFiles.isRecording()).toBe(false);
  });
});

describe("recordWrites", () => {
  it("writes nothing and returns what the run would change", async () => {
    const dir = makeDir();
    writeFileSync(join(dir, "changed.txt"), "before\n");
    writeFileSync(join(dir, "same.txt"), "same\n");
    writeFileSync(join(dir, "removed.txt"), "gone\n");
    mkdirSync(join(dir, "old"));
    writeFileSync(join(dir, "old/a.txt"), "a\n");

    const { changes } = await recordWrites(async () => {
      expect(projectFiles.isRecording()).toBe(true);
      projectFiles.writeSync(join(dir, "changed.txt"), "after\n");
      projectFiles.writeSync(join(dir, "same.txt"), "same\n");
      await writeFileEnsuringDir(join(dir, "added/new.txt"), "new\n");
      projectFiles.remove(join(dir, "removed.txt"));
      projectFiles.remove(join(dir, "old"));
    });

    expect(changes).toEqual([
      { path: join(dir, "added/new.txt"), before: undefined, after: "new\n" },
      { path: join(dir, "changed.txt"), before: "before\n", after: "after\n" },
      { path: join(dir, "old/a.txt"), before: "a\n", after: undefined },
      { path: join(dir, "removed.txt"), before: "gone\n", after: undefined },
    ]);
    expect(readFileSync(join(dir, "changed.txt"), "utf-8")).toBe("before\n");
    expect(existsSync(join(dir, "added"))).toBe(false);
    expect(existsSync(join(dir, "removed.txt"))).toBe(true);
    expect(existsSync(join(dir, "old/a.txt"))).toBe(true);
  });

  it("lets a step read what an earlier step wrote or removed", async () => {
    const dir = makeDir();
    writeFileSync(join(dir, "kept.txt"), "kept\n");
    writeFileSync(join(dir, "dropped.txt"), "dropped\n");

    await recordWrites(async () => {
      projectFiles.writeSync(join(dir, "hosts/a/host.js"), "a\n");
      projectFiles.remove(join(dir, "dropped.txt"));
      expect(projectFiles.exists(join(dir, "hosts"))).toBe(true);
      expect(projectFiles.read(join(dir, "hosts/a/host.js"))).toBe("a\n");
      expect(projectFiles.exists(join(dir, "dropped.txt"))).toBe(false);
      expect(projectFiles.read(join(dir, "dropped.txt"))).toBeUndefined();
      expect(projectFiles.list(dir).sort()).toEqual(["hosts", "kept.txt"]);
      await Promise.resolve();
    });
  });

  it("records what a writer that takes a path leaves there", async () => {
    const dir = makeDir();
    const file = join(dir, "package.json");
    writeFileSync(file, '{"name":"a"}\n');

    const { changes } = await recordWrites(async () => {
      await projectFiles.writeWith(file, async (target) => {
        const pkg = JSON.parse(readFileSync(target, "utf-8")) as object;
        writeFileSync(target, `${JSON.stringify({ ...pkg, added: true })}\n`);
        await Promise.resolve();
      });
    });

    expect(changes).toEqual([
      {
        path: file,
        before: '{"name":"a"}\n',
        after: '{"name":"a","added":true}\n',
      },
    ]);
    expect(readFileSync(file, "utf-8")).toBe('{"name":"a"}\n');
  });
});
