import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  chmodSync,
  cpSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { capacity, demand } from "./schedule.mjs";

const checkout = resolve(import.meta.dirname, "../..");
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
function put(root, file, value) {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof value === "string" ? value : JSON.stringify(value),
  );
}
const trace = (file) => {
  const keys = [],
    covered = [];
  let source;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("SF:")) source = line.slice(3);
    const match = line.match(/^DA:(\d+),(\d+)/);
    if (match) {
      const key = `${source}:${match[1]}`;
      keys.push(key);
      if (+match[2]) covered.push(key);
    }
  }
  return { keys: keys.sort(), covered: covered.sort() };
};

function retireFixture(root) {
  if (process.env.PH_WORKFLOW_OUT)
    cpSync(
      root,
      join(process.env.PH_WORKFLOW_OUT, "fixtures", basename(root)),
      {
        recursive: true,
        filter: (path) =>
          !relative(root, path)
            .split(/[\\/]/)
            .some((part) =>
              ["node_modules", ".git", "pnpm-store"].includes(part),
            ),
      },
    );
  rmSync(root, { recursive: true, force: true });
}
function fixture(
  root,
  patterns = ["packages/*"],
  runner = join(import.meta.dirname, "run.mjs"),
) {
  symlinkSync(
    join(checkout, "node_modules"),
    join(root, "node_modules"),
    "dir",
  );
  put(root, ".gitignore", "node_modules/\ncoverage/\n");
  put(
    root,
    "pnpm-workspace.yaml",
    `packages:\n${patterns.map((value) => `  - "${value}"`).join("\n")}\nverifyDepsBeforeRun: false\n`,
  );
  put(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  put(root, "package.json", {
    type: "module",
    private: true,
    scripts: {
      "test:coverage:baseline": `node ${runner}`,
    },
  });
}
function commitFixture(root) {
  for (const args of [
    ["init", "-q"],
    ["add", "."],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    ],
  ]) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
}
async function invoke(root, out, args, extra = {}) {
  const env = { ...process.env, CI: "true", ...extra };
  for (const key of Object.keys(env))
    if (key.startsWith("PH_COVERAGE_") || key === "NODE_V8_COVERAGE")
      delete env[key];
  const child = spawn(
    "pnpm",
    ["test:coverage:baseline", "--out", out, ...args],
    { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let log = "";
  child.stdout.on("data", (value) => (log += value));
  child.stderr.on("data", (value) => (log += value));
  const timer = setTimeout(() => child.kill("SIGINT"), 60000);
  const [code] = await once(child, "close");
  clearTimeout(timer);
  assert.ok(existsSync(join(out, "run.json")), log);
  return { code, log, run: read(join(out, "run.json")) };
}

test(
  "an output path inside the checkout, reached through a symlink, is not an input change",
  { timeout: 90000 },
  async () => {
    const parent = mkdtempSync(join(tmpdir(), "ph-coverage-output-alias-"));
    const root = join(parent, "repo");
    mkdirSync(root);
    try {
      fixture(root);
      put(root, "packages/owner/package.json", {
        name: "output-alias-owner",
        type: "module",
        scripts: { test: "vitest run" },
      });
      put(root, "packages/owner/src/product.ts", "export const value=42;\n");
      put(
        root,
        "packages/owner/case.unit.test.ts",
        'import {test,expect} from "vitest";import {existsSync,readFileSync} from "node:fs";import {value} from "./src/product";test("report output is excluded and neighboring input remains",()=>{expect(value).toBe(42);expect(readFileSync(new URL("../../coverage/keep.txt",import.meta.url),"utf8")).toBe("keep me");expect(existsSync(new URL("../../coverage/current/run.json",import.meta.url))).toBe(true);});\n',
      );
      commitFixture(root);
      put(root, "coverage/keep.txt", "keep me");
      const alias = join(parent, "alias");
      symlinkSync(root, alias, "dir");
      const out = join(alias, "coverage/current");
      const result = await invoke(root, out, ["--jobs", "1"]);
      assert.equal(result.code, 0, result.log);
      assert.equal(result.run.jobs[0].outcomes.passed, 1);
      assert.equal(result.run.jobs[0].outcomes.failed, 0);
      assert.equal(result.run.jobs[0].scenario.inPlace, true);
      assert.equal(result.run.jobs[0].scenario.inputValidAfter, true);
    } finally {
      retireFixture(parent);
    }
  },
);

test(
  "in-place Vitest owners share native state with fresh processes, and a source change stops later in-place jobs",
  { timeout: 120000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "ph-coverage-workspace-proof-"));
    const events = join(root, "coverage/events.jsonl");
    try {
      fixture(root);
      put(root, ".gitignore", "node_modules/\ncoverage/\n.native-state\n");
      for (const owner of ["a", "b", "c", "d", "e"]) {
        put(root, `packages/${owner}/package.json`, {
          name: `workspace-${owner}`,
          type: "module",
          scripts: { test: "vitest run" },
        });
        put(
          root,
          `packages/${owner}/src/product.ts`,
          "export function value() { return 42; }\n",
        );
        put(
          root,
          `packages/${owner}/case.unit.test.ts`,
          `
import { test, expect } from "vitest";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { value } from "./src/product";
test("native workspace ${owner}", () => {
  const root = resolve(process.cwd(), "../..");
  appendFileSync(process.env.WORKSPACE_EVENTS, JSON.stringify({ owner: ${JSON.stringify(owner)}, root, pid: process.pid }) + "\\n");
  expect(value()).toBe(42);
  ${owner === "a" ? 'writeFileSync(resolve(root, ".native-state"), "native cache state");' : ""}
  ${owner === "b" ? 'expect(readFileSync(resolve(root, ".native-state"), "utf8")).toBe("native cache state");' : ""}
  ${["d", "e"].includes(owner) ? 'expect(existsSync(resolve(root, ".native-state"))).toBe(true);' : ""}
  ${owner === "c" ? 'expect("deliberate failure").toBe("preserved");' : ""}
  ${owner === "d" ? 'writeFileSync(new URL("./src/product.ts", import.meta.url), "export function value() { return 0; }\\n");' : ""}
});
`,
        );
      }
      commitFixture(root);
      mkdirSync(dirname(events), { recursive: true });
      const out = join(root, "coverage/result");
      const result = await invoke(
        root,
        out,
        ["--jobs", "1", "--tier", "unit"],
        {
          WORKSPACE_EVENTS: events,
        },
      );
      assert.equal(result.code, 1, result.log);
      const observations = result.run.jobs.filter(
        (job) => !job.execution?.notRun && job.files.length,
      );
      assert.deepEqual(
        observations.map((job) => [job.owner, job.execution?.code ?? null]),
        [
          ["packages/a", 0],
          ["packages/b", 0],
          ["packages/c", 1],
          ["packages/d", 0],
          ["packages/e", null],
        ],
      );
      const recorded = readFileSync(events, "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse);
      assert.deepEqual(
        recorded.map(({ owner }) => owner),
        ["a", "b", "c", "d"],
      );
      assert.equal(
        new Set(recorded.map(({ pid }) => pid)).size,
        4,
        "Native processes crossed observations",
      );
      assert.ok(
        recorded.every(
          ({ root: seen }) => realpathSync(seen) === realpathSync(root),
        ),
        "Vitest owners must run in the reference checkout",
      );
      for (const job of observations.slice(0, 4)) {
        assert.equal(job.scenario.inPlace, true);
        assert.equal(job.timing.cloneMs, undefined);
        assert.equal(job.cleanup.method, "process-group+environment");
        assert.equal(job.cleanup.valid, true);
      }
      assert.equal(observations[0].scenario.inputValidAfter, true);
      assert.equal(observations[3].scenario.inputValidAfter, false);
      assert.equal(observations[3].collection.valid, false);
      assert.ok(observations[3].withholdCoverage);
      assert.deepEqual(observations[4].gaps, [
        "An in-place job changed the reference checkout; later in-place jobs did not run",
      ]);
      assert.equal(result.run.workspaces.length, 0);
      assert.ok(existsSync(join(root, "packages/a/package.json")));
      assert.ok(result.run.sourceChanged.length);
      assert.match(result.log, /Measured product source changed/);
    } finally {
      retireFixture(root);
    }
  },
);

test(
  "registry inputs use pinned native A and B commits",
  { timeout: 120000 },
  () => {
    const root = mkdtempSync(join(tmpdir(), "ph-coverage-refs-"));
    try {
      fixture(root, ["packages/*", "test/*"]);
      put(root, "packages/library/package.json", {
        name: "coverage-library",
        type: "module",
      });
      put(root, "packages/library/value.mjs", "export const value = 42;\n");
      put(root, "test/registry-e2e/package.json", {
        name: "test-registry-e2e",
        type: "module",
        scripts: { test: "node run.mjs" },
      });
      put(
        root,
        "test/registry-e2e/run.mjs",
        [
          'import { execFileSync } from "node:child_process";',
          'import { writeFileSync } from "node:fs";',
          'import { value } from "../../packages/library/value.mjs";',
          'const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();',
          'git("update-ref", "refs/heads/coverage-base", "HEAD");',
          'const refs = process.argv.slice(2).filter(a => a.includes("=")).map(a => a.split("=", 2));',
          'if (refs.length !== 2 || refs[0][0] !== "A" || refs[1][0] !== "B") throw new Error("Both native refs are required");',
          'writeFileSync(process.env.REF_RESULT, JSON.stringify(refs.map(([label, ref]) => ({ label, commit: git("rev-parse", ref), value: git("show", ref + ":ref-value.txt") }))));',
          'if (value !== 42) throw new Error("Wrong product value");',
        ].join("\n"),
      );
      put(root, "ref-value.txt", "serial\n");
      commitFixture(root);
      const git = (...args) =>
        spawnSync("git", args, { cwd: root, encoding: "utf8" });
      const base = git("rev-parse", "HEAD").stdout.trim();
      put(root, "ref-value.txt", "current\n");
      commitFixture(root);
      const head = git("rev-parse", "HEAD").stdout.trim();
      assert.equal(
        git("update-ref", "refs/heads/coverage-base", base).status,
        0,
      );
      assert.equal(
        git("update-ref", "refs/remotes/origin/main", head).status,
        0,
      );
      const out = join(root, "coverage/refs");
      const result = spawnSync(
        process.execPath,
        [
          join(import.meta.dirname, "run.mjs"),
          "--out",
          out,
          "--suite",
          "script:test/registry-e2e:test",
          "--registry-ref",
          "coverage-base",
          "--jobs",
          "1",
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            CI: "true",
            REF_RESULT: join(out, "observed-refs.json"),
          },
          encoding: "utf8",
          timeout: 60000,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      assert.ok(
        existsSync(join(out, "run.json")),
        result.stdout + result.stderr,
      );
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.deepEqual(read(join(out, "observed-refs.json")), [
        { label: "A", commit: base, value: "serial" },
        { label: "B", commit: head, value: "current" },
      ]);
      const job = read(join(out, "run.json")).jobs[0];
      assert.deepEqual(job.gitRefs, {
        A: { ref: "coverage-base", commit: base },
        B: { ref: "HEAD", commit: head },
      });
      assert.equal(git("rev-parse", "coverage-base").stdout.trim(), base);
      assert.equal(job.cleanup.valid, true);
    } finally {
      retireFixture(root);
    }
  },
);

test(
  "failed Playwright artifacts survive private cleanup through Node and pnpm",
  { timeout: 180000 },
  () => {
    const root = mkdtempSync(join(tmpdir(), "ph-coverage-artifacts-"));
    try {
      fixture(root);
      put(root, "packages/workflow/package.json", {
        name: "coverage-workflow",
        type: "module",
        scripts: { "test:ui": "playwright test" },
      });
      put(
        root,
        "packages/workflow/node_modules/.bin/playwright",
        `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dirname, "node_modules/@playwright/test/cli.js")}" "$@"\n`,
      );
      chmodSync(
        join(root, "packages/workflow/node_modules/.bin/playwright"),
        0o755,
      );
      put(
        root,
        "packages/workflow/src/value.mjs",
        "export const value = 42;\n",
      );
      put(
        root,
        "packages/workflow/playwright.config.ts",
        [
          'export default { testDir: "test/ui", workers: 1, retries: 1,',
          'use: { screenshot: "only-on-failure", trace: "retain-on-failure" } };',
        ].join("\n"),
      );
      put(
        root,
        "packages/workflow/test/ui/publish.spec.ts",
        [
          "import { test, expect } from " +
            JSON.stringify(join(import.meta.dirname, "playwright.mjs")) +
            ";",
          'import { value } from "../../src/value.mjs";',
          'test("passes", async ({ page }) => { await page.setContent("<h1>ready</h1>"); expect(value).toBe(42); });',
          'test("fails with evidence", async ({ page }) => { await page.setContent("<h1>ready</h1>"); await expect(page.getByText("missing", { exact: true })).toBeVisible({ timeout: 50 }); });',
        ].join("\n"),
      );
      commitFixture(root);
      for (const [name, command] of [
        ["node", [process.execPath, join(import.meta.dirname, "run.mjs")]],
        ["pnpm", ["pnpm", "test:coverage:baseline"]],
      ]) {
        const out = join(root, "coverage", name);
        const result = spawnSync(
          command[0],
          [
            ...command.slice(1),
            "--out",
            out,
            "--suite",
            "script:packages/workflow:test:ui",
            "--jobs",
            "1",
          ],
          {
            cwd: root,
            env: { ...process.env, CI: "true" },
            encoding: "utf8",
            timeout: 60000,
            maxBuffer: 16 * 1024 * 1024,
          },
        );
        assert.equal(result.status, 1, result.stdout + result.stderr);
        const job = read(join(out, "run.json")).jobs[0];
        const native = read(join(job.out, "playwright.json"));
        assert.equal(native.stats.expected, 1);
        assert.equal(native.stats.unexpected, 1);
        assert.equal(native.stats.skipped, 0);
        const attachments = [];
        const visit = (suite) => {
          for (const spec of suite.specs ?? [])
            for (const test of spec.tests ?? [])
              for (const attempt of test.results ?? [])
                attachments.push(...attempt.attachments);
          for (const child of suite.suites ?? []) visit(child);
        };
        native.suites.forEach(visit);
        assert.equal(attachments.length, 6);
        assert.equal(job.cleanup.valid, true);
        assert.equal(existsSync(job.root), false);
        for (const attachment of attachments) {
          assert.ok(
            existsSync(attachment.path),
            "Missing retained attachment: " + attachment.path,
          );
          assert.ok(!relative(job.out, attachment.path).startsWith(".."));
          assert.ok(readFileSync(attachment.path).length > 0);
        }
      }
    } finally {
      retireFixture(root);
    }
  },
);

test("parallel capacity and endpoint claims preserve existing defaults and overrides", () => {
  assert.throws(() => capacity("0"), /positive integer/);
  assert.equal(capacity("1").jobs, 1);
  const job = {
    owner: "packages/workflow",
    runner: "playwright",
    files: ["test.spec.ts"],
    env: {},
  };
  const workflow = demand(job, {});
  const vetra = demand({ ...job, owner: "test/vetra-e2e" }, {});
  const fusion = demand({ ...job, owner: "test/test-fusion" }, {});
  assert.ok(!workflow.keys.some((key) => vetra.keys.includes(key)));
  assert.ok(workflow.keys.some((key) => fusion.keys.includes(key)));
  assert.deepEqual(
    demand(job, {
      UI_SHOTS_SWITCHBOARD_PORT: "4501",
      UI_SHOTS_CONNECT_PORT: "4510",
    }).ports,
    [4501, 4510],
  );
  const sb = {
    ...job,
    owner: "test/switchboard",
    runner: "vitest",
    files: [
      "test/switchboard/src/renown-self-auth.test.ts",
      "test/switchboard/src/router.test.ts",
    ],
  };
  assert.ok(demand(sb, { SWITCHBOARD_PORT: "4012" }).keys.includes("tcp:4012"));
  assert.ok(demand(sb, {}).keys.includes("tcp:4022"));
  assert.ok(
    demand(sb, { SWITCHBOARD_ROUTER_PORT: "4999" }).keys.includes("tcp:4999"),
  );
  const consumed = demand(
    { ...sb, files: [] },
    { SWITCHBOARD_URL: "http://127.0.0.1:4001/graphql" },
  );
  assert.deepEqual(consumed.ports, []);
  assert.deepEqual(consumed.preflightPorts, []);
  assert.ok(consumed.keys.includes("tcp:4001"));
  assert.deepEqual(
    demand(
      { ...job, owner: "test/test-connect", runner: "custom" },
      { PH_LOAD_TEST_PORT: "4012" },
    ).ports,
    [4012],
  );
  const piece = demand(
    { ...job, owner: "test/workflow-piece-e2e" },
    { PH_WORKFLOW_E2E_PORT: "4500" },
  );
  assert.deepEqual(piece.ports, [8080, 4500, 4501, 4502]);
  assert.deepEqual(piece.preflightPorts, [8080]);
  const reused = demand(
    { ...job, owner: "test/workflow-piece-e2e" },
    { PH_WORKFLOW_E2E_REUSE_REGISTRY: "1" },
  );
  assert.ok(reused.keys.includes("tcp:8080"));
  assert.deepEqual(reused.preflightPorts, []);
  const analytics = {
    ...job,
    owner: "packages/analytics-engine/pg",
    runner: "vitest",
  };
  assert.ok(
    demand(analytics, {
      PG_CONNECTION_STRING: "postgres://ignored:5444/db",
    }).keys.includes("postgres:127.0.0.1:5555"),
  );
  assert.ok(
    demand(
      {
        ...analytics,
        env: { PG_CONNECTION_STRING: "postgres://explicit:5511/db" },
      },
      {},
    ).keys.includes("postgres:explicit:5511"),
  );
  assert.ok(
    demand(
      { ...job, owner: "apps/reactor-monitor" },
      { PH_MONITOR_TEST_PG_URL: "postgres://monitor:5522/db" },
    ).keys.includes("postgres:monitor:5522"),
  );
  assert.ok(
    demand(
      { ...job, owner: "packages/reactor-api", scriptName: "test:integration" },
      {
        REACTOR_TEST_PG_URL: "postgres://ignored:1/db",
        REACTOR_TEST_PG_HOST: "hub",
        REACTOR_TEST_PG_PORT: "5533",
      },
    ).keys.includes("postgres:hub:5533"),
  );
  for (const port of [undefined, "", "5433", "05433"])
    for (const explicit of [false, true])
      assert.ok(
        demand(
          {
            ...job,
            owner: "packages/reactor-api",
            scriptName: "test:integration",
            env: explicit ? { REACTOR_TEST_PG_PORT: port } : {},
          },
          { REACTOR_TEST_PG_PORT: explicit ? "5444" : port },
        ).keys.includes(
          `postgres:127.0.0.1:${explicit && port === undefined ? 5444 : 5433}`,
        ),
      );
});

test(
  "the public coverage command overlaps native jobs, serializes shared owners and preserves coverage and failures",
  { timeout: 600000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "ph-coverage-parallel-proof-"));
    const server = createServer();
    let mode = "serial",
      events = [],
      held = [],
      daemon = [],
      overlap = false,
      cancelChild,
      crashOut;
    server.on("request", (request, response) => {
      const url = new URL(request.url, "http://localhost");
      const who = url.searchParams.get("who");
      events.push([url.pathname, who, Date.now()]);
      if (url.pathname === "/daemon") {
        daemon.push({
          pid: +url.searchParams.get("pid"),
          port: +url.searchParams.get("port"),
        });
        if (cancelChild) setImmediate(() => cancelChild.kill("SIGINT"));
        if (crashOut) {
          const current = read(join(crashOut, "run.json"));
          const victim = current.jobs.find(
            (job) => job.id === "vitest:packages/alpha:integration",
          );
          assert.equal(victim.status, "running");
          assert.ok(Number.isSafeInteger(victim.workerPid));
          process.kill(victim.workerPid, "SIGKILL");
        }
      }
      if (
        url.pathname === "/enter" &&
        mode === "parallel" &&
        who !== "alpha-integration"
      ) {
        held.push(response);
        if (held.length === 4) {
          overlap = true;
          for (const item of held) item.end("go");
          held = [];
        }
      } else response.end("ok");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const url = `http://127.0.0.1:${server.address().port}`;
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const sharedPort = reservation.address().port;
    await new Promise((done) => reservation.close(done));
    const children = new Set(),
      samples = [];
    try {
      symlinkSync(
        join(checkout, "node_modules"),
        join(root, "node_modules"),
        "dir",
      );
      put(root, ".gitignore", "node_modules/\ncoverage/\n.state/\n");
      put(
        root,
        "pnpm-workspace.yaml",
        'packages:\n  - "packages/*"\nverifyDepsBeforeRun: false\n',
      );
      put(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
      put(root, "package.json", {
        type: "module",
        private: true,
        scripts: {
          "test:coverage:baseline": `node ${join(import.meta.dirname, "run.mjs")}`,
        },
      });
      for (const owner of ["alpha", "beta", "gamma", "delta"]) {
        put(root, `packages/${owner}/package.json`, {
          name: `parallel-${owner}`,
          type: "module",
          scripts: { test: "cross-env ORIGINAL_ENV=preserved vitest run" },
        });
        put(
          root,
          `packages/${owner}/vitest.config.mts`,
          'export default {test:{maxWorkers:1,env:{ORIGINAL_CONFIG:"preserved"}}};\n',
        );
        put(
          root,
          `packages/${owner}/src/product.ts`,
          "export function unit() {\n  return 1;\n}\nexport function integration() {\n  return 2;\n}\nexport function untouched() {\n  return 3;\n}\n",
        );
        const labels = owner === "alpha" ? ["unit", "integration"] : ["unit"];
        for (const level of labels) {
          const who = `${owner}-${level}`;
          const daemonCode = `const fs=require("node:fs"),http=require("node:http");const s=http.createServer((q,r)=>r.end("owned"));s.listen(0,"127.0.0.1",()=>fs.writeFileSync(process.argv[1],JSON.stringify({pid:process.pid,port:s.address().port})));`;
          put(
            root,
            `packages/${owner}/case.${level}.test.ts`,
            `import {test,expect} from "vitest";
import {createServer} from "node:net";import {once} from "node:events";import {spawn} from "node:child_process";import {readFileSync,existsSync,mkdirSync} from "node:fs";import {join} from "node:path";
import {${level}} from "./src/product";
test(${JSON.stringify(who)},async()=>{
  expect(process.env.ORIGINAL_ENV).toBe("preserved");expect(process.env.ORIGINAL_CONFIG).toBe("preserved");
  const service=${owner === "alpha" ? `createServer().listen(${sharedPort},"127.0.0.1")` : "undefined"};if(service)await once(service,"listening");
  await fetch(process.env.CONTROL_URL+"/enter?who=${who}");expect(${level}()).toBe(${level === "unit" ? 1 : 2});
  ${owner === "alpha" && level === "integration" ? `mkdirSync(".state",{recursive:true});const ready=join(process.cwd(),".state/daemon.json");const child=spawn(process.execPath,["-e",${JSON.stringify(daemonCode)},ready],{cwd:process.cwd(),stdio:"ignore",detached:true});child.unref();while(!existsSync(ready))await new Promise(done=>setTimeout(done,10));const info=JSON.parse(readFileSync(ready,"utf8"));await fetch(process.env.CONTROL_URL+"/daemon?pid="+info.pid+"&port="+info.port);` : ""}
  if(process.env.PROOF_WAIT === "1" && "${who}" === "alpha-integration") await new Promise(()=>{});
  if(service)await new Promise(done=>service.close(done));await fetch(process.env.CONTROL_URL+"/leave?who=${who}");
},15000);
${owner === "beta" ? 'test("deliberate failure remains recorded",()=>expect(false).toBe(true));test.skip("deliberate skip remains recorded",()=>{});' : ""}
`,
          );
        }
      }
      for (const args of [
        ["git", "init", "-q"],
        ["git", "add", "."],
      ]) {
        const result = spawnSync(args[0], args.slice(1), {
          cwd: root,
          encoding: "utf8",
        });
        assert.equal(result.status, 0, result.stderr);
      }
      const commit = spawnSync(
        "git",
        [
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "commit",
          "-qm",
          "fixture",
        ],
        { cwd: root, encoding: "utf8" },
      );
      assert.equal(commit.status, 0, commit.stderr);
      const inputs = readFileSync(join(root, "packages/alpha/package.json"));
      const collect = async (name, jobs, fault) => {
        const cancel = fault === "cancel",
          crash = fault === "crash";
        mode = jobs === 1 ? "serial" : "parallel";
        events = [];
        held = [];
        daemon = [];
        overlap = false;
        const out = join(root, "coverage", name),
          started = performance.now();
        const env = {
          ...process.env,
          CONTROL_URL: url,
          CI: "true",
          PROOF_WAIT: cancel || crash ? "1" : "0",
        };
        for (const key of Object.keys(env))
          if (key.startsWith("PH_COVERAGE_") || key === "NODE_V8_COVERAGE")
            delete env[key];
        const child = spawn(
          cancel ? process.execPath : "pnpm",
          [
            cancel
              ? join(import.meta.dirname, "run.mjs")
              : "test:coverage:baseline",
            "--out",
            out,
            "--jobs",
            String(jobs),
            "--bun",
            "/unavailable/bun",
          ],
          { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
        );
        children.add(child);
        cancelChild = cancel ? child : undefined;
        crashOut = crash ? out : undefined;
        let log = "";
        child.stdout.on("data", (data) => (log += data));
        child.stderr.on("data", (data) => (log += data));
        const timer = setTimeout(() => child.kill("SIGINT"), 90000);
        const [code] = await once(child, "close");
        clearTimeout(timer);
        children.delete(child);
        assert.equal(code, cancel ? 130 : 1, log);
        const run = read(join(out, "run.json"));
        if (!cancel) assert.equal(run.rendering.code, 0, log);
        assert.equal(run.complete, false);
        assert.ok(run.jobs.every((job) => Array.isArray(job.gaps)));
        if (!cancel && !crash)
          assert.ok(
            run.jobs.every(
              (job) => job.outcomes?.notApplicable || job.cleanup?.valid,
            ),
            log,
          );
        if (crash) {
          const victim = run.jobs.find(
            (job) => job.id === "vitest:packages/alpha:integration",
          );
          assert.ok(
            victim.gaps.some((gap) => /SIGKILL/.test(gap)),
            log,
          );
          assert.ok(victim.withholdCoverage);
          assert.equal(victim.cleanup.valid, true);
          assert.equal(daemon.length, 1);
          for (const info of daemon)
            await assert.rejects(fetch(`http://127.0.0.1:${info.port}`));
          assert.equal(victim.scenario.inPlace, true);
          assert.equal(victim.scenario.retainedRoot, undefined);
          assert.ok(existsSync(join(root, "packages/alpha/package.json")));
          return;
        }
        if (cancel) {
          assert.ok(
            run.jobs.some((job) =>
              job.gaps.some((gap) => /interrupt/i.test(gap)),
            ),
            log,
          );
          for (const info of daemon)
            await assert.rejects(fetch(`http://127.0.0.1:${info.port}`));
          assert.equal(daemon.length, 1);
          assert.equal((await fetch(url + "/alive")).status, 200);
          return;
        }
        const actual = run.jobs.filter((job) => !job.outcomes?.notApplicable);
        assert.equal(actual.length, 5, log);
        for (const info of daemon)
          await assert.rejects(fetch(`http://127.0.0.1:${info.port}`));
        assert.equal(daemon.length, 1, log);
        if (jobs > 1) assert.ok(overlap, log);
        const alphaUnit = actual.find(
          (job) => job.id === "vitest:packages/alpha:unit",
        );
        const alphaIntegration = actual.find(
          (job) => job.id === "vitest:packages/alpha:integration",
        );
        assert.ok(
          Date.parse(alphaIntegration.dispatchedAt) >=
            Date.parse(alphaUnit.timing.finishedAt),
        );
        assert.ok(
          events.findIndex(
            ([path, who]) => path === "/leave" && who === "alpha-unit",
          ) <
            events.findIndex(
              ([path, who]) => path === "/enter" && who === "alpha-integration",
            ),
        );
        const layers = Object.fromEntries(
          ["unit", "integration", "combined"].map((level) => [
            level,
            trace(join(out, "lcov", level + ".info")),
          ]),
        );
        assert.equal(
          existsSync(join(out, "lcov/e2e.info")),
          false,
          "A level without collected suites has no layer",
        );
        for (const layer of Object.values(layers))
          assert.deepEqual(layer.keys, layers.combined.keys);
        assert.deepEqual(
          [
            ...new Set(
              ["unit", "integration"].flatMap((level) => layers[level].covered),
            ),
          ].sort(),
          layers.combined.covered,
        );
        assert.deepEqual(
          readFileSync(join(root, "packages/alpha/package.json")),
          inputs,
        );
        return {
          elapsedMs: performance.now() - started,
          layers,
          cases: actual
            .map((job) => ({
              id: job.id,
              files: job.files,
              code: job.execution?.code,
              total: job.outcomes.total,
              passed: job.outcomes.passed,
              failed: job.outcomes.failed,
              skipped: job.outcomes.skipped,
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        };
      };
      for (let pair = 0; pair < 5; pair++) {
        const serial = await collect(`serial-${pair}`, 1),
          parallel = await collect(`parallel-${pair}`, 4);
        assert.deepEqual(parallel.cases, serial.cases);
        assert.deepEqual(parallel.layers, serial.layers);
        samples.push({
          serialMs: serial.elapsedMs,
          parallelMs: parallel.elapsedMs,
        });
      }
      await collect("cancelled", 4, "cancel");
      await collect("crashed", 4, "crash");
      if (process.env.PH_WORKFLOW_OUT)
        put(process.env.PH_WORKFLOW_OUT, "parallel-fixture-timings.json", {
          pairs: 5,
          samples,
          scope:
            "Real native fixture; full-repository target is verified separately",
        });
    } finally {
      for (const child of children) child.kill("SIGINT");
      for (const response of held) response.end("cancel");
      await new Promise((done) => server.close(done));
      retireFixture(root);
    }
  },
);

test(
  "native endpoint overrides coordinate different owners and consumed services stay usable",
  { timeout: 120000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "ph-coverage-endpoints-"));
    const healthy = createServer((request, response) =>
      response.end("healthy"),
    );
    healthy.listen(8080, "127.0.0.1");
    await once(healthy, "listening");
    const external = `http://127.0.0.1:${healthy.address().port}`;
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = reservation.address().port;
    await new Promise((done) => reservation.close(done));
    try {
      fixture(root, ["test/*", "packages/*"]);
      put(root, "test/switchboard/package.json", {
        name: "endpoint-switchboard",
        type: "module",
        scripts: { test: "vitest run" },
      });
      put(
        root,
        "test/switchboard/vitest.config.mts",
        "export default {test:{maxWorkers:1}};\n",
      );
      put(
        root,
        "test/switchboard/src/value.ts",
        "export function value() { return 42; }\n",
      );
      put(
        root,
        "test/switchboard/case.unit.test.ts",
        `import {test,expect} from "vitest";import {createServer} from "node:http";import {once} from "node:events";import {value} from "./src/value";
test("native endpoint",async()=>{expect(value()).toBe(42);if(process.env.SWITCHBOARD_URL){expect(await (await fetch(process.env.SWITCHBOARD_URL)).text()).toBe("healthy");return;}const server=createServer((q,r)=>r.end("own"));server.listen(Number(process.env.SWITCHBOARD_PORT),"127.0.0.1");await once(server,"listening");expect(await(await fetch("http://127.0.0.1:"+process.env.SWITCHBOARD_PORT)).text()).toBe("own");await new Promise(done=>server.close(done));});\n`,
      );
      put(root, "packages/workflow/package.json", {
        name: "endpoint-workflow",
        type: "module",
        scripts: { "test:ui": "node serve.mjs" },
      });
      put(
        root,
        "packages/workflow/serve.mjs",
        'import {createServer} from "node:http";import {once} from "node:events";const server=createServer((q,r)=>r.end("own"));server.listen(Number(process.env.UI_SHOTS_SWITCHBOARD_PORT),"127.0.0.1");await once(server,"listening");if(await(await fetch("http://127.0.0.1:"+process.env.UI_SHOTS_SWITCHBOARD_PORT)).text()!=="own")throw Error("wrong service");await new Promise(done=>server.close(done));\n',
      );
      put(
        root,
        "packages/workflow/test/ui/prop-controls.spec.ts",
        "// Native fixture selector.\n",
      );
      put(
        root,
        "packages/workflow/test/ui/example.spec.ts",
        "// Native fixture selector.\n",
      );
      commitFixture(root);
      const shared = await invoke(
        root,
        join(root, "coverage/shared"),
        ["--jobs", "4", "--all"],
        {
          SWITCHBOARD_URL: "",
          SWITCHBOARD_PORT: String(port),
          UI_SHOTS_SWITCHBOARD_PORT: String(port),
        },
      );
      assert.equal(shared.code, 1, shared.log); // Stub browser jobs have unknown outcomes.
      const jobs = shared.run.jobs
        .filter((job) => !job.outcomes?.notApplicable)
        .sort(
          (a, b) => Date.parse(a.dispatchedAt) - Date.parse(b.dispatchedAt),
        );
      assert.equal(jobs.length, 3, shared.log);
      for (const job of jobs) assert.equal(job.execution.code, 0, shared.log);
      const leased = [...jobs].sort(
        (a, b) => Date.parse(a.lease.grantedAt) - Date.parse(b.lease.grantedAt),
      );
      for (let i = 1; i < leased.length; i++)
        assert.ok(
          Date.parse(leased[i].lease.grantedAt) >=
            Date.parse(leased[i - 1].lease.releasedAt),
          shared.log,
        );
      assert.ok(
        jobs.some((job) =>
          jobs.some(
            (other) =>
              job.id !== other.id &&
              job.owner !== other.owner &&
              Date.parse(job.dispatchedAt) <
                Date.parse(other.timing.finishedAt) &&
              Date.parse(other.dispatchedAt) <
                Date.parse(job.timing.finishedAt),
          ),
        ),
        shared.log,
      );
      const consumed = await invoke(
        root,
        join(root, "coverage/external"),
        ["--owner", "test/switchboard", "--tier", "unit", "--jobs", "1"],
        { SWITCHBOARD_URL: external, SWITCHBOARD_PORT: String(port) },
      );
      assert.equal(consumed.code, 0, consumed.log);
      assert.equal(consumed.run.jobs[0].outcomes.passed, 1);
      assert.deepEqual(consumed.run.jobs[0].resources.ports, []);
      assert.ok(
        consumed.run.jobs[0].resources.keys.includes(
          `tcp:${healthy.address().port}`,
        ),
      );
      assert.equal(await (await fetch(external)).text(), "healthy");
      put(root, "test/workflow-piece-e2e/package.json", {
        name: "endpoint-reused-registry",
        type: "module",
        scripts: { test: "node consume.mjs" },
      });
      put(
        root,
        "test/workflow-piece-e2e/consume.mjs",
        'if(process.env.PH_WORKFLOW_E2E_REUSE_REGISTRY!=="1")throw Error("reuse flag lost");if(await(await fetch("http://127.0.0.1:8080")).text()!=="healthy")throw Error("registry unavailable");\n',
      );
      put(
        root,
        "test/workflow-piece-e2e/case.e2e.test.ts",
        "// Native fixture selector.\n",
      );
      commitFixture(root);
      const registry = await invoke(
        root,
        join(root, "coverage/reused-registry"),
        ["--owner", "test/workflow-piece-e2e", "--tier", "e2e"],
        { PH_WORKFLOW_E2E_REUSE_REGISTRY: "1" },
      );
      assert.equal(registry.code, 1, registry.log); // Custom outcomes remain unknown.
      assert.equal(registry.run.jobs[0].execution.code, 0, registry.log);
      assert.ok(registry.run.jobs[0].resources.keys.includes("tcp:8080"));
      assert.deepEqual(registry.run.jobs[0].resources.preflightPorts, []);
      assert.equal(await (await fetch(external)).text(), "healthy");
    } finally {
      await new Promise((done) => healthy.close(done));
      retireFixture(root);
    }
  },
);

test(
  "isolated execution preserves native compiler-output assertions",
  { timeout: 90000 },
  async () => {
    const parent = mkdtempSync(
      join(dirname(checkout), "ph-coverage-native-location-proof-"),
    );
    const root = join(parent, "workspace/source/repo");
    mkdirSync(root, { recursive: true });
    try {
      fixture(
        root,
        ["clis/*"],
        process.env.PH_COVERAGE_PROOF_RUNNER ??
          join(import.meta.dirname, "run.mjs"),
      );
      put(root, "clis/ph-cli/package.json", {
        name: "native-compiler-owner",
        type: "module",
        scripts: { test: "vitest --run" },
      });
      for (const file of [
        "vitest.config.ts",
        "test/compiler-output.test.ts",
        "test/compile-fixture.ts",
        "src/services/definitions/compiler-output.ts",
      ]) {
        const target = join(root, "clis/ph-cli", file);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(join(checkout, "clis/ph-cli", file), target);
      }
      commitFixture(root);
      const native = spawnSync("pnpm", ["test", "compiler-output.test.ts"], {
        cwd: join(root, "clis/ph-cli"),
        env: { ...process.env, CI: "true" },
        encoding: "utf8",
      });
      assert.equal(native.status, 0, native.stdout + native.stderr);
      const result = await invoke(root, join(root, "coverage/native"), [
        "--owner",
        "clis/ph-cli",
        "--tier",
        "unit",
        "--jobs",
        "1",
      ]);
      assert.equal(result.code, 0, result.log);
      assert.equal(result.run.complete, true, result.log);
      assert.equal(result.run.jobs[0].outcomes.passed, 6);
      assert.equal(result.run.jobs[0].outcomes.failed, 0);
    } finally {
      retireFixture(parent);
    }
  },
);

test(
  "Node CLI cancellation stops an active renderer and its native descendants",
  { timeout: 90000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "ph-coverage-render-cancel-"));
    let child, marker;
    try {
      fixture(root);
      put(root, "packages/owner/package.json", {
        name: "render-cancel-owner",
        type: "module",
        scripts: { test: "vitest run" },
      });
      put(
        root,
        "packages/owner/vitest.config.mts",
        "export default {test:{maxWorkers:1}};\n",
      );
      put(root, "packages/owner/src/product.ts", "export const value=42;\n");
      put(
        root,
        "packages/owner/case.unit.test.ts",
        'import {test,expect} from "vitest";import {value} from "./src/product";test("actual native case",()=>expect(value).toBe(42));\n',
      );
      // The renderer's native descendant is the Vitest run that seeds untouched source; hold it there.
      const ready = join(root, "ready.json"),
        out = join(root, "coverage/cancelled"),
        hold = join(root, "bin/hold.mjs");
      put(
        root,
        "bin/hold.mjs",
        `import fs from "node:fs";if(process.argv.some((arg)=>arg.includes("seed.config.mjs"))){const marker=${JSON.stringify(ready)},temp=marker+"."+process.pid;fs.writeFileSync(temp,JSON.stringify({pid:process.pid,parent:process.ppid}));try{fs.linkSync(temp,marker);}catch(error){if(error.code!=="EEXIST")throw error;}fs.unlinkSync(temp);setInterval(()=>{},1000);await new Promise(()=>{});}\n`,
      );
      commitFixture(root);
      const env = {
        ...process.env,
        CI: "true",
        NODE_OPTIONS: `--import=${pathToFileURL(hold).href}`,
      };
      for (const key of Object.keys(env))
        if (key.startsWith("PH_COVERAGE_") || key === "NODE_V8_COVERAGE")
          delete env[key];
      const entry =
        process.env.PARALLEL_RENDER_ENTRY ??
        join(import.meta.dirname, "run.mjs");
      child = spawn(process.execPath, [entry, "--out", out, "--jobs", "1"], {
        cwd: root,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let log = "";
      child.stdout.on("data", (data) => (log += data));
      child.stderr.on("data", (data) => (log += data));
      const closed = once(child, "close"),
        deadline = Date.now() + 45000;
      while (
        !existsSync(ready) &&
        child.exitCode === null &&
        Date.now() < deadline
      )
        await new Promise((done) => setTimeout(done, 10));
      assert.ok(existsSync(ready), log);
      marker = read(ready);
      child.kill("SIGINT");
      const [code] = await closed;
      for (const pid of [marker.parent, marker.pid])
        assert.throws(
          () => process.kill(pid, 0),
          /ESRCH|no such process/i,
          "renderer survived coordinator cancellation",
        );
      assert.equal(code, 130, log);
      const run = read(join(out, "run.json"));
      assert.equal(run.complete, false);
      assert.equal(run.rendering.groupCleanup.valid, true);
      assert.ok(
        run.jobs.some((job) => job.outcomes?.passed === 1),
        log,
      );
    } finally {
      child?.kill("SIGTERM");
      for (const pid of marker ? [marker.pid, marker.parent] : []) {
        const info = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
          encoding: "utf8",
        });
        if (info.stdout.includes(root))
          spawnSync("kill", ["-KILL", String(pid)], { stdio: "ignore" });
      }
      retireFixture(root);
    }
  },
);
