import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { classifyTest, discoverSuites, tierOf } from "./suites.mjs";

const checkout = resolve(import.meta.dirname, "../..");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const put = (root, file, value) => {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof value === "string" ? value : JSON.stringify(value),
  );
};
const run = (root, args) => {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `${args.join(" ")}\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`,
  );
  return result;
};

test(
  "native pnpm coverage and the baseline reuse owner configuration without requiring Bun",
  { timeout: 180000 },
  () => {
    const root = mkdtempSync(join(tmpdir(), "ph-coverage-reuse-"));
    try {
      symlinkSync(
        join(checkout, "node_modules"),
        join(root, "node_modules"),
        "dir",
      );
      put(root, ".gitignore", "node_modules/\ncoverage/\n");
      put(
        root,
        "pnpm-workspace.yaml",
        'packages:\n  - "packages/**"\n  - "tools/*"\n  - "!packages/excluded"\nverifyDepsBeforeRun: false\n',
      );
      put(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
      const scripts = read(join(checkout, "package.json")).scripts;
      put(root, "package.json", {
        name: "coverage-reuse-proof",
        type: "module",
        private: true,
        scripts: {
          "test:coverage": scripts["test:coverage"],
          "test:coverage:baseline": `node ${join(import.meta.dirname, "run.mjs")}`,
        },
      });
      for (const owner of [
        "packages/owner",
        "packages/nested/leaf",
        "tools/helper",
        "packages/excluded",
      ])
        put(root, `${owner}/package.json`, {
          name: owner.replaceAll("/", "-"),
          type: "module",
          scripts: {
            test:
              owner === "packages/owner"
                ? "cross-env ORIGINAL_SETTING=kept vitest run --exclude cli-excluded.unit.test.ts"
                : "vitest run",
          },
        });
      put(
        root,
        "packages/owner/vitest.config.mts",
        'export default { test: { include: ["*.unit.test.ts"], exclude: ["config-excluded.unit.test.ts"], env: { OWNER_CONFIG: "present" } } };\n',
      );
      put(
        root,
        "packages/owner/src/value.ts",
        "export function value() {\n  return 42;\n}\n",
      );
      put(
        root,
        "packages/owner/value.unit.test.ts",
        'import { expect, test } from "vitest"; import { value } from "./src/value"; test("owner settings apply", () => { expect(process.env.OWNER_CONFIG).toBe("present"); expect(process.env.ORIGINAL_SETTING).toBe("kept"); expect(value()).toBe(42); });\n',
      );
      put(
        root,
        "packages/owner/ignored.test.ts",
        'import { test } from "vitest"; test("native config excludes this", () => { throw new Error("must not execute"); });\n',
      );
      for (const name of [
        "cli-excluded.unit.test.ts",
        "config-excluded.unit.test.ts",
      ])
        put(
          root,
          `packages/owner/${name}`,
          'import { test } from "vitest"; test("excluded case must not run", () => { throw new Error("exclusions lost"); });\n',
        );
      const ownerPackage = readFileSync(
        join(root, "packages/owner/package.json"),
      );
      const ownerConfig = readFileSync(
        join(root, "packages/owner/vitest.config.mts"),
      );
      run(root, ["git", "init", "-q"]);
      run(root, ["git", "add", "."]);
      run(root, [
        "git",
        "-c",
        "user.name=Coverage proof",
        "-c",
        "user.email=coverage@example.invalid",
        "commit",
        "-qm",
        "fixture",
      ]);
      const jobs = discoverSuites(root);
      assert.ok(
        jobs.some(({ owner }) => owner === "packages/nested/leaf"),
        JSON.stringify(jobs.map(({ owner }) => owner)),
      );
      assert.ok(jobs.some(({ owner }) => owner === "tools/helper"));
      assert.ok(!jobs.some(({ owner }) => owner === "packages/excluded"));
      run(root, [
        "pnpm",
        "exec",
        "cross-env",
        "ORIGINAL_SETTING=kept",
        "pnpm",
        "test:coverage",
        "--root",
        "packages/owner",
        "--exclude",
        "cli-excluded.unit.test.ts",
        "--coverage.reporter=json-summary",
      ]);
      run(root, [
        "pnpm",
        "test:coverage:baseline",
        "--root",
        root,
        "--out",
        join(root, "coverage/baseline"),
        "--suite",
        "vitest:packages/owner:unit",
        "--bun",
        "/unavailable/bun",
        "--registry-ref",
        "/unavailable/ref",
      ]);
      const result = read(join(root, "coverage/baseline/run.json"));
      assert.deepEqual(
        readFileSync(join(root, "packages/owner/package.json")),
        ownerPackage,
      );
      assert.deepEqual(
        readFileSync(join(root, "packages/owner/vitest.config.mts")),
        ownerConfig,
      );
      assert.equal(result.bun, null);
      assert.equal(result.complete, true);
      assert.equal(result.jobs[0].outcomes.passed, 1);
      assert.deepEqual(result.jobs[0].outcomes.selection.selected, [
        "packages/owner/value.unit.test.ts",
      ]);
      assert.equal(
        result.jobs[0].classification.find(({ file }) =>
          file.endsWith("ignored.test.ts"),
        ).basis,
        "legacy-unreviewed",
      );
      assert.match(
        readFileSync(
          join(root, "coverage/baseline/lcov/combined.info"),
          "utf8",
        ),
        /^DA:2,[1-9]/m,
      );
      assert.match(
        readFileSync(join(root, "coverage/baseline/report/README.md"), "utf8"),
        /Lua unit tests/,
      );
    } finally {
      if (process.env.PH_WORKFLOW_OUT)
        cpSync(
          root,
          join(process.env.PH_WORKFLOW_OUT, "fixtures", basename(root)),
          {
            recursive: true,
            filter: (path) =>
              !path.endsWith("/node_modules") && !path.endsWith("/.git"),
          },
        );
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test("reviewed exceptions, explicit levels and mixed-file provenance survive legacy defaults", () => {
  assert.equal(
    tierOf("packages/reactor/test/shared/errors.unit.test.ts"),
    "unit",
  );
  assert.equal(
    tierOf("packages/reactor-api/test/graphql-errors.unit.test.ts"),
    "unit",
  );
  assert.equal(tierOf("packages/registry/tests/e2e.test.ts"), "e2e");
  assert.equal(
    tierOf("packages/registry/tests/migrations.test.ts"),
    "integration",
  );
  assert.equal(
    tierOf("packages/reactor-workflow/src/reactor/oauth.test.ts"),
    "integration",
  );
  assert.deepEqual(
    classifyTest("packages/workflow/test/ui/schedule-builder.spec.ts").labels,
    ["ui"],
  );
  assert.equal(
    tierOf("packages/workflow/test/ui/schedule-builder.spec.ts"),
    "unit",
  );
  assert.equal(
    classifyTest("tools/doc-harness/test/workspace.test.ts").basis,
    "mixed",
  );
  assert.equal(
    classifyTest("packages/example/legacy.test.ts").basis,
    "legacy-unreviewed",
  );
});
