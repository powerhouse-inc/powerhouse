import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = join(root, "scripts/test-shard.ts");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function run(args, env = {}, entry = script) {
  return spawnSync(process.execPath, [entry, ...args], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...process.env,
      TEST_SHARD_SCRIPT: "test:ci",
      TEST_SHARD_WEIGHTS: "scripts/test-weights.json",
      ...env,
    },
  });
}

for (const [suite, weights, total] of [
  ["test:ci", "scripts/test-weights.json", 3],
  ["test:ci:platform", "scripts/test-weights.windows.json", 2],
]) {
  test(`${suite}: every package runs exactly once and is built with its dependencies`, () => {
    const env = { TEST_SHARD_SCRIPT: suite, TEST_SHARD_WEIGHTS: weights };
    const printed = run(["--print", String(total)], env);
    assert.equal(printed.status, 0, printed.stderr);
    const shards = printed.stdout
      .split(/^shard .+\n/m)
      .slice(1)
      .map((s) => s.trim().split(/\s+/));
    const expected = [
      ...manifest.scripts[suite].matchAll(/--filter=(\S+)/g),
    ].map((m) => m[1]);
    assert.equal(shards.length, total);
    assert.deepEqual(shards.flat().sort(), expected.sort());
    for (const [i, packages] of shards.entries()) {
      const selected = run(["--selectors", String(i + 1), String(total)], env);
      assert.equal(selected.status, 0, selected.stderr);
      const selectors = new Set(selected.stdout.trim().split(/\s+/));
      for (const name of packages) assert.ok(selectors.has(`${name}...`), name);
      if (packages.includes("@powerhousedao/codegen")) {
        for (const name of [
          "@powerhousedao/ph-cli",
          "@powerhousedao/clint",
          "@powerhousedao/connect",
        ]) {
          assert.ok(selectors.has(`${name}...`), name);
        }
      }
      if (packages.includes("@powerhousedao/reactor-monitor-app")) {
        assert.ok(selectors.has("@powerhousedao/ph-cli..."));
        assert.ok(selectors.has("@powerhousedao/connect..."));
      }
      if (packages.includes("@powerhousedao/builder-tools")) {
        assert.ok(selectors.has("@powerhousedao/connect..."));
        assert.ok(selectors.has("@powerhousedao/versioned-documents..."));
      }
    }
  });
}

test("suites overlap within the limit, all finish, and failures determine the exit code", () => {
  const fixture = mkdtempSync(join(tmpdir(), "test-shard-"));
  try {
    mkdirSync(join(fixture, "scripts"));
    copyFileSync(script, join(fixture, "scripts/test-shard.ts"));
    writeFileSync(
      join(fixture, "pnpm-workspace.yaml"),
      'packages:\n  - "packages/*"\n',
    );
    writeFileSync(
      join(fixture, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        scripts: {
          "test:ci": "pnpm --filter=a --filter=b --filter=c --no-bail run test",
        },
      }),
    );
    writeFileSync(
      join(fixture, "scripts/test-weights.json"),
      JSON.stringify({ a: 3, b: 2, c: 1 }),
    );
    writeFileSync(
      join(fixture, "suite.mjs"),
      `
      import { existsSync, writeFileSync } from "node:fs";
      import { setTimeout } from "node:timers/promises";
      const name = process.argv[2];
      writeFileSync(new URL(name + ".started", import.meta.url), "");
      if (name === "c" && !["a", "b"].some((peer) => existsSync(new URL(peer + ".finished", import.meta.url)))) {
        process.exit(9);
      }
      if (name !== "c") {
        const peer = new URL((name === "a" ? "b" : "a") + ".started", import.meta.url);
        const deadline = Date.now() + 8000;
        while (!existsSync(peer)) {
          if (Date.now() > deadline) process.exit(8);
          await setTimeout(20);
        }
      }
      writeFileSync(new URL(name + ".finished", import.meta.url), "");
      process.exit(name === process.env.FAIL_SUITE ? 7 : 0);
    `,
    );
    for (const name of ["a", "b", "c"]) {
      const dir = join(fixture, "packages", name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name,
          version: "1.0.0",
          scripts: { test: `node ../../suite.mjs ${name}` },
          ...(name === "b" ? { dependencies: { a: "workspace:*" } } : {}),
        }),
      );
    }
    for (const failure of ["", "a"]) {
      const result = run(
        ["1", "1"],
        { FAIL_SUITE: failure },
        join(fixture, "scripts/test-shard.ts"),
      );
      assert.ifError(result.error);
      assert.equal(
        result.status === 0,
        failure === "",
        result.stdout + result.stderr,
      );
      for (const name of ["a", "b", "c"]) {
        assert.equal(
          readFileSync(join(fixture, `${name}.finished`), "utf8"),
          "",
          result.stdout + result.stderr,
        );
        rmSync(join(fixture, `${name}.started`));
        rmSync(join(fixture, `${name}.finished`));
      }
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
