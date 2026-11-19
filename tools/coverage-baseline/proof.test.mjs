import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createServer as createPortServer } from "node:net";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { transformSync } from "@swc/core";
import { chromium } from "@playwright/test";
import { sourceFiles } from "./config.mjs";
import { prepareVitest, recordVitestSelection } from "./vitest.mjs";
import { canonicalLcov, externalReport, renderReports } from "./report.mjs";
import { closeContext, collectBrowser } from "./playwright.mjs";
import {
  bunSourceBase,
  inspectJob,
  isComplete,
  verifySourceIdentity,
} from "./results.mjs";

const checkout = resolve(import.meta.dirname, "../..");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const put = (root, path, value) => {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
  return file;
};
const json = (root, path, value) => put(root, path, JSON.stringify(value));
const run = (argv, cwd, extra = {}) => {
  const env = { ...process.env, CI: "true" };
  for (const key of Object.keys(env))
    if (key === "NODE_V8_COVERAGE" || key.startsWith("PH_COVERAGE_"))
      delete env[key];
  if (argv[0] === "bun" && process.env.PH_COVERAGE_BUN)
    argv = [process.env.PH_COVERAGE_BUN, ...argv.slice(1)];
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    env: { ...env, ...extra },
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `${argv.join(" ")}\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`,
  );
  return result;
};
const retire = (root) => {
  try {
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};
const trace = (path, root) =>
  readFileSync(path, "utf8")
    .split("end_of_record")
    .flatMap((block) => {
      const file = block.match(/^SF:(.+)$/m)?.[1];
      return file
        ? [...block.matchAll(/^DA:(\d+),(\d+)/gm)].map(([, line, hits]) => ({
            file: relative(root, resolve(root, file)).replaceAll("\\", "/"),
            line: Number(line),
            hits: Number(hits),
          }))
        : [];
    });
const lineKeys = (entries) =>
  entries.map(({ file, line }) => `${file}:${line}`).sort();
const covered = (entries) => lineKeys(entries.filter(({ hits }) => hits > 0));
const listen = async (server) => {
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return address.port;
};
const close = (server) =>
  new Promise((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );

test("malformed native records retain valid coverage and make collection partial", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ph-native-records-")));
  try {
    const source = "packages/native/index.mjs";
    put(root, source, "export const answer = () => 42;\n");
    const spec = put(
      root,
      "packages/native/index.test.mjs",
      'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { answer } from "./index.mjs";\ntest("answer", () => assert.equal(answer(), 42));\n',
    );
    const sourceFile = json(root, "sources.json", [source]);
    const clean = join(root, "clean");
    mkdirSync(clean);
    run(
      [
        process.execPath,
        "--test",
        "--test-reporter=junit",
        `--test-reporter-destination=${join(clean, "junit.xml")}`,
        spec,
      ],
      root,
      { NODE_TEST_CONTEXT: undefined, NODE_V8_COVERAGE: join(clean, "node") },
    );
    const application = put(
      root,
      "run.mjs",
      'import { answer } from "./packages/native/index.mjs";\nif (answer() !== 42) throw new Error("Wrong answer");\n',
    );
    run([process.execPath, application], root, {
      NODE_V8_COVERAGE: join(clean, "node"),
    });
    assert.ok(readdirSync(join(clean, "node")).length > 0);
    const mixed = join(root, "mixed");
    cpSync(clean, mixed, { recursive: true });
    const rejected = {
      "empty.json": "",
      "truncated.json": "{",
      "shape.json": '{"result":{}}',
    };
    for (const [name, text] of Object.entries(rejected))
      put(mixed, `node/${name}`, text);
    const jobs = [clean, mixed].map((out) => {
      const job = {
        root,
        out,
        sourceFile,
        runner: "node",
        execution: { code: 0 },
      };
      const input = json(out, "job.json", job);
      run(
        [
          process.execPath,
          join(import.meta.dirname, "report.mjs"),
          "external",
          input,
        ],
        root,
      );
      return { ...job, collection: read(join(out, "collection.json")) };
    });
    assert.equal(jobs[1].collection.valid, true);
    assert.ok(jobs[1].collection.nodeRecords > 0);
    assert.equal(jobs[1].collection.rejectedNodeRecords.length, 3);
    for (const record of jobs[1].collection.rejectedNodeRecords) {
      const text = rejected[record.file.slice("node/".length)];
      assert.equal(record.bytes, Buffer.byteLength(text));
      assert.equal(
        record.sha256,
        createHash("sha256").update(text).digest("hex"),
      );
      assert.ok(record.reason);
      assert.equal(readFileSync(join(mixed, record.file), "utf8"), text);
    }
    const traces = jobs.map((job) =>
      trace(join(job.out, "external/lcov.info"), root),
    );
    assert.ok(covered(traces[0]).length > 0);
    assert.deepEqual(traces[1], traces[0]);
    const observations = jobs.map((job) => ({ ...job, ...inspectJob(job) }));
    assert.equal(isComplete([observations[0]]), true);
    assert.equal(isComplete([observations[1]]), false);
    assert.equal(observations[1].gaps.length, 3);
    assert.ok(
      observations[1].gaps.every((gap) =>
        gap.startsWith("Rejected native coverage record:"),
      ),
    );
  } finally {
    retire(root);
  }
});

test(
  "native runtimes map distinct product lines into the same fixed-denominator reports",
  { timeout: 300000 },
  async () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "ph-native-coverage-")),
    );
    let browser, server, finishBrowser;
    try {
      run(["git", "init", "-q"], root);
      symlinkSync(
        join(checkout, "node_modules"),
        join(root, "node_modules"),
        "dir",
      );
      put(
        root,
        ".gitignore",
        "node_modules/\nout/\n**/dist/\n**/ignored-dependency/\n",
      );
      json(root, "package.json", { type: "module" });
      put(
        root,
        "pnpm-workspace.yaml",
        'packages:\n  - "packages/*"\nverifyDepsBeforeRun: false\n',
      );
      json(root, "packages/library/package.json", {
        name: "@ph-coverage-proof/library",
        version: "1.0.0",
        type: "module",
        exports: "./dist/choice.mjs",
        files: ["dist"],
      });
      json(root, "packages/consumer/package.json", {
        name: "@ph-coverage-proof/consumer",
        type: "module",
        scripts: {
          test: "cross-env SCRIPT_FLAG=preserved vitest run",
          "test:integration":
            "cross-env SCRIPT_FLAG=preserved vitest run choice.integration.test.ts",
        },
      });
      json(root, "packages/duplicate/package.json", {
        name: "@ph-coverage-proof/duplicate",
        type: "module",
      });
      const values = {
        unit: 11,
        integration: 22,
        child: 33,
        worker: 44,
        bun: 55,
        browser: 66,
        packed: 77,
      };
      const code = Object.entries(values)
        .map(
          ([name, value]) =>
            `export function ${name}() {\n  return ${value};\n}\n`,
        )
        .join("");
      const product = "packages/library/src/choice.ts";
      const never = "packages/library/src/never.ts";
      const duplicate = "packages/duplicate/src/choice.ts";
      const localProduct = "packages/consumer/src/local[unit].ts";
      const comments = "packages/library/src/comments.ts";
      put(
        root,
        localProduct,
        "export function localUnit() {\n  return 88;\n}\n",
      );
      put(root, product, code);
      put(root, comments, "// No executable code.\n/* Comment only. */\n");
      put(root, never, "export function never() {\n  return 99;\n}\n");
      put(
        root,
        duplicate,
        "export function duplicate() {\n  return -100;\n}\n",
      );
      put(
        root,
        "utility.mjs",
        "export function untouchedRoot() { return 0; }\n",
      );
      const compiled = transformSync(code, {
        filename: "choice.ts",
        sourceFileName: "../src/choice.ts",
        sourceMaps: true,
        inlineSourcesContent: true,
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
      });
      assert.deepEqual(JSON.parse(compiled.map).sources, ["../src/choice.ts"]);
      const generated =
        compiled.code + "\n//# sourceMappingURL=choice.mjs.map\n";
      put(root, "packages/library/dist/choice.mjs", generated);
      put(root, "packages/library/dist/choice.mjs.map", compiled.map);
      for (const tier of ["unit", "integration"])
        put(
          root,
          `packages/consumer/choice.${tier === "unit" ? "test" : "integration.test"}.ts`,
          `import { test, expect } from "vitest"; import { ${tier} } from "../library/${tier === "integration" ? "dist/choice.mjs" : "src/choice"}"; ${tier === "unit" ? 'import { localUnit } from "./src/local[unit]";' : ""} test("${tier}", () => { expect(process.env.SCRIPT_FLAG).toBe("preserved"); expect(process.env.PROJECT_CLASS).toBe(${JSON.stringify(tier === "unit" ? "main" : "held")}); expect(${tier}()).toBe(${values[tier]}); ${tier === "unit" ? "expect(localUnit()).toBe(88);" : ""} });\n`,
        );
      put(
        root,
        "packages/consumer/vitest.config.mts",
        `export default { test: { projects: [ { extends: true, test: { name: "main", include: ["**/*.test.ts"], exclude: ["**/*.integration.test.ts"], env: { PROJECT_CLASS: "main" } } }, { extends: true, test: { name: "held", include: ["**/*.integration.test.ts"], maxWorkers: 1, sequence: { groupOrder: 1 }, env: { PROJECT_CLASS: "held" } } } ] } };\n`,
      );
      const sources = sourceFiles(root);
      const ignoredSpec =
        "packages/consumer/ignored-dependency/noise[ignored].test.ts";
      put(
        root,
        ignoredSpec,
        'import { test } from "vitest"; test("ignored dependency must not run", () => { throw new Error("not a repository test"); });\n',
      );
      assert.deepEqual(sources, [
        localProduct,
        duplicate,
        product,
        comments,
        never,
        "utility.mjs",
      ]);
      const sourceFile = json(root, "out/sources.json", sources);
      const sourceHashes = Object.fromEntries(
        sources.map((path) => [
          path,
          createHash("sha256")
            .update(readFileSync(join(root, path)))
            .digest("hex"),
        ]),
      );
      const markers = Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
          name,
          code
            .split("\n")
            .findIndex((line) => line.trim() === `return ${value};`) + 1,
        ]),
      );
      const jobs = [];
      const job = (name, tier = "e2e", cwd = root) => ({
        root,
        sources,
        tier,
        cwd,
        out: join(root, "out", name),
      });
      const assertMarkers = (entries, expected) => {
        for (const [name, line] of Object.entries(markers)) {
          const hit = entries.some(
            (entry) =>
              entry.file === product && entry.line === line && entry.hits > 0,
          );
          assert.equal(
            hit,
            expected.includes(name),
            `${name} product line ${line}: expected ${expected.join(", ")}`,
          );
        }
      };
      const nativeTrace = (item, report, base = root) => {
        const canonical = join(item.out, "accepted.info");
        assert.ok(
          canonicalLcov(
            join(item.out, report),
            base,
            root,
            new Set(sources),
            canonical,
          ) > 0,
          `No original source in ${report}`,
        );
        return trace(canonical, root);
      };
      for (const tier of ["unit", "integration"]) {
        const item = {
          ...job(tier, tier, join(root, "packages/consumer")),
          sourceFile,
          runner: "vitest",
          owner: "packages/consumer",
          args: ["pnpm", "run", tier === "unit" ? "test" : "test:integration"],
          originalScript:
            tier === "unit"
              ? "cross-env SCRIPT_FLAG=preserved vitest run"
              : "cross-env SCRIPT_FLAG=preserved vitest run choice.integration.test.ts",
          env: {},
          files: [
            `packages/consumer/choice.${tier === "unit" ? "test" : "integration.test"}.ts`,
          ],
        };
        const argv = prepareVitest(item);
        run(argv, item.cwd, { NODE_V8_COVERAGE: join(item.out, "node") });
        recordVitestSelection(item);
        const selection = read(join(item.out, "selection.json"));
        assert.ok(!selection.selected.includes(ignoredSpec));
        assert.deepEqual(selection.selected, [
          `packages/consumer/choice.${tier === "unit" ? "test" : "integration.test"}.ts`,
        ]);
        assert.equal(read(join(item.out, "tests.json")).numPassedTests, 1);
        const included = Object.keys(
          read(join(item.out, "vitest/coverage-summary.json")),
        )
          .filter((path) => path !== "total")
          .map((path) => relative(root, path));
        assert.ok(
          included.includes(product),
          "Vitest must retain the other package's executed source",
        );
        const native = nativeTrace(item, "vitest/lcov.info");
        assertMarkers(native, [tier]);
        if (tier === "unit")
          assert.ok(
            native.some(
              ({ file, line, hits }) =>
                file === localProduct && line === 2 && hits > 0,
            ),
            "Package-local implementation was not covered",
          );
        item.execution = { code: 0 };
        jobs.push(item);
      }
      for (const name of ["child", "worker"])
        put(
          root,
          `out/${name}-entry.mjs`,
          `import { ${name} } from "../packages/library/dist/choice.mjs"; if (${name}() !== ${values[name]}) throw Error("wrong ${name} result");\n`,
        );
      const childLauncher = put(
        root,
        "out/child-launcher.mjs",
        'import { spawnSync } from "node:child_process"; import { fileURLToPath } from "node:url"; const result = spawnSync(process.execPath, [fileURLToPath(new URL("./child-entry.mjs", import.meta.url))], { stdio: "inherit" }); if (result.status !== 0) throw Error("child failed");\n',
      );
      const workerLauncher = put(
        root,
        "out/worker-launcher.mjs",
        'import { Worker } from "node:worker_threads"; const worker = new Worker(new URL("./worker-entry.mjs", import.meta.url)); await new Promise((done, reject) => { worker.once("error", reject); worker.once("exit", code => code === 0 ? done() : reject(Error(`worker exit ${code}`))); });\n',
      );
      for (const [name, launcher] of [
        ["child", childLauncher],
        ["worker", workerLauncher],
      ]) {
        const item = job(name);
        run([process.execPath, launcher], root, {
          NODE_V8_COVERAGE: join(item.out, "node"),
        });
        item.collection = await externalReport(item);
        assert.ok(item.collection.nodeRecords > 0);
        assertMarkers(nativeTrace(item, "external/lcov.info"), [name]);
        jobs.push(item);
      }
      const packedDir = join(root, "out/packed");
      mkdirSync(packedDir, { recursive: true });
      run(
        ["pnpm", "pack", "--pack-destination", packedDir],
        join(root, "packages/library"),
      );
      const archives = readdirSync(packedDir).filter((name) =>
        name.endsWith(".tgz"),
      );
      assert.equal(archives.length, 1);
      const consumer = join(root, "out/packed-consumer");
      json(consumer, "package.json", {
        name: "packed-proof",
        private: true,
        type: "module",
        dependencies: {
          "@ph-coverage-proof/library": `file:${join(packedDir, archives[0])}`,
        },
      });
      run(
        [
          "pnpm",
          "install",
          "--offline",
          "--ignore-scripts",
          "--ignore-workspace",
          "--no-frozen-lockfile",
          "--config.package-import-method=copy",
          "--config.enable-global-virtual-store=false",
          "--store-dir",
          join(root, "out/pnpm-store"),
          "--virtual-store-dir",
          "node_modules/.pnpm",
        ],
        consumer,
      );
      assert.ok(
        realpathSync(
          join(
            consumer,
            "node_modules/@ph-coverage-proof/library/dist/choice.mjs",
          ),
        ).startsWith(join(consumer, "node_modules/")),
      );
      const packedEntry = put(
        consumer,
        "run.mjs",
        'import { packed } from "@ph-coverage-proof/library"; if (packed() !== 77) throw Error("packed consumer failed");\n',
      );
      const packed = job("packed-native", "e2e", consumer);
      run([process.execPath, packedEntry], consumer, {
        NODE_V8_COVERAGE: join(packed.out, "node"),
      });
      packed.collection = await externalReport(packed);
      assertMarkers(nativeTrace(packed, "external/lcov.info"), ["packed"]);
      jobs.push(packed);
      const installedMap = join(
        consumer,
        "node_modules/@ph-coverage-proof/library/dist/choice.mjs.map",
      );
      const corrupt = job("corrupt-packed-map", "e2e", consumer);
      writeFileSync(
        installedMap,
        JSON.stringify({
          ...JSON.parse(compiled.map),
          sourcesContent: [code.replace("return 77", "return -77")],
        }),
      );
      try {
        run([process.execPath, packedEntry], consumer, {
          NODE_V8_COVERAGE: join(corrupt.out, "node"),
        });
        await assert.rejects(
          externalReport(corrupt),
          /source.*(?:match|content)|map.*content/i,
        );
      } finally {
        writeFileSync(installedMap, compiled.map);
      }

      const bun = { ...job("bun-native"), runner: "bun" };
      mkdirSync(join(bun.out, "bun"), { recursive: true });
      const bunEntry = put(
        root,
        "out/bun.test.ts",
        `import { test, expect, afterAll } from "bun:test"; import { bun } from "../packages/library/src/choice"; test("native Bun", () => expect(bun()).toBe(55)); afterAll(() => process.chdir(${JSON.stringify(join(root, "out"))}));\n`,
      );
      run(
        [
          "bun",
          "test",
          bunEntry,
          "--preload",
          join(import.meta.dirname, "bun.mjs"),
          "--coverage",
          "--coverage-reporter=lcov",
          "--coverage-dir",
          join(bun.out, "bun"),
          "--reporter=junit",
          "--reporter-outfile",
          join(bun.out, "junit.xml"),
        ],
        root,
        { PH_COVERAGE_BUN_ORIGIN: join(bun.out, "bun/origin.json") },
      );
      assert.equal(bunSourceBase(bun), join(root, "out"));
      assertMarkers(nativeTrace(bun, "bun/lcov.info", bunSourceBase(bun)), [
        "bun",
      ]);
      assert.ok(inspectJob(bun).gaps.some((gap) => gap.includes("nested Bun")));
      jobs.push(bun);

      let mapRequests = 0;
      const servedModule = `/@fs${root}/packages/library/dist/choice.mjs`;
      const routes = new Map([
        [
          "/",
          [
            "text/html",
            '<body>waiting<script>const worker = new SharedWorker("/worker.js", { type: "module" }); worker.port.onmessage = event => document.body.textContent = String(event.data); worker.port.start();</script></body>',
          ],
        ],
        [
          "/worker.js",
          [
            "text/javascript",
            // The product module loads only after the page's message, so it always compiles after profiling is armed.
            `globalThis.onconnect = event => { const port = event.ports[0]; port.onmessage = async () => port.postMessage((await import(${JSON.stringify(servedModule)})).browser()); port.start(); };`,
          ],
        ],
        [
          "/cold",
          [
            "text/html",
            '<body>waiting<script>const worker = new SharedWorker("/cold-worker.js", { type: "module" }); worker.port.onmessage = event => document.body.textContent = String(event.data); worker.port.start();</script></body>',
          ],
        ],
        [
          "/cold-worker.js",
          [
            "text/javascript",
            `import { browser } from ${JSON.stringify(servedModule)}; globalThis.onconnect = event => event.ports[0].postMessage(browser());`,
          ],
        ],
        [servedModule, ["text/javascript", generated]],
        [`${servedModule}.map`, ["application/json", compiled.map]],
      ]);
      server = createServer((request, response) => {
        const route = routes.get(request.url);
        if (!route) {
          response.writeHead(404);
          response.end();
          return;
        }
        if (request.url.endsWith(".map")) mapRequests++;
        response.setHeader("Content-Type", route[0]);
        response.end(route[1]);
      });
      const httpPort = await listen(server);
      const reservation = createPortServer();
      const debugPort = await listen(reservation);
      await close(reservation);
      browser = await chromium.launch({
        headless: true,
        args: [`--remote-debugging-port=${debugPort}`],
      });
      const context = await browser.newContext();
      const chromiumJob = job("chromium");
      let workerReady;
      const workerArmed = new Promise((done) => (workerReady = done));
      const finish = await collectBrowser(
        browser,
        debugPort,
        join(chromiumJob.out, "browser"),
        {
          root,
          sources,
          testIds: new Set(["armed-shared-worker"]),
          onTargetReady: ({ type }) => {
            if (type === "shared_worker") workerReady();
          },
        },
      );
      finishBrowser = finish;
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${httpPort}`, {
        waitUntil: "domcontentloaded",
      });
      await workerArmed;
      await page.evaluate("worker.port.postMessage('go')");
      await page.waitForFunction(() => document.body.textContent === "66");
      await closeContext(context);
      finishBrowser = undefined;
      await finish();
      assert.ok(
        mapRequests > 0,
        "External HTTP map was not cached while the server was alive",
      );
      const browserFixture = {
        ...job("browser-fixture"),
        runner: "playwright",
        execution: { code: 0 },
      };
      mkdirSync(browserFixture.out, { recursive: true });
      const fixtureConfig = put(
        root,
        "out/browser-fixture/playwright.config.mjs",
        `export default ${JSON.stringify({ testDir: ".", testMatch: "*.spec.mjs", workers: 1, retries: 0, timeout: 30000, use: { headless: true } })};\n`,
      );
      put(
        root,
        "out/browser-fixture/shared-page.spec.mjs",
        `import { test as base, expect, closeContext } from ${JSON.stringify(join(import.meta.dirname, "playwright.mjs"))};
const test = base.extend({
  sharedPage: [async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:${httpPort}/cold");
    await expect(page.locator("body")).toHaveText("66");
    try { await use(page); } finally { await closeContext(context); }
  }, { scope: "worker" }],
});
for (const name of ["first context", "second context"])
  test(name, async ({ sharedPage, page }) => {
    await expect(sharedPage.locator("body")).toHaveText("66");
    await page.goto("http://127.0.0.1:${httpPort}/cold");
    await expect(page.locator("body")).toHaveText("66");
  });
`,
      );
      const fixtureChild = spawn(
        process.execPath,
        [
          join(import.meta.dirname, "node_modules/@playwright/test/cli.js"),
          "test",
          "--config",
          fixtureConfig,
          "--reporter=json",
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            CI: "true",
            NODE_V8_COVERAGE: "",
            PH_COVERAGE_BROWSER_DIR: join(browserFixture.out, "browser"),
            PH_COVERAGE_ROOT: root,
            PH_COVERAGE_SOURCES: sourceFile,
            PLAYWRIGHT_JSON_OUTPUT_FILE: join(
              browserFixture.out,
              "playwright.json",
            ),
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let fixtureLog = "";
      for (const stream of [fixtureChild.stdout, fixtureChild.stderr])
        stream.on("data", (data) => (fixtureLog += data));
      const fixtureExit = await new Promise((done, reject) => {
        fixtureChild.once("error", reject);
        fixtureChild.once("close", done);
      });
      assert.equal(fixtureExit, 0, fixtureLog);
      await close(server);
      assert.equal(server.listening, false);
      chromiumJob.collection = await externalReport(chromiumJob);
      // Under load the worker's own entry can start before the profiler; that script alone is left out.
      assert.ok(
        chromiumJob.collection.browserErrors.every((error) =>
          /^Coverage of 1 shared_worker script\(s\) was not added: compiled before profiling \(http:\/\/127\.0\.0\.1:\d+\/worker\.js\)$/.test(
            error,
          ),
        ),
        chromiumJob.collection.browserErrors.join("\n"),
      );
      assert.deepEqual(chromiumJob.collection.browserTestIds, [
        "armed-shared-worker",
      ]);
      assertMarkers(nativeTrace(chromiumJob, "external/lcov.info"), [
        "browser",
      ]);
      jobs.push(chromiumJob);
      browserFixture.collection = await externalReport(browserFixture);
      assert.ok(
        browserFixture.collection.browserErrors.every(
          (error) =>
            error.startsWith("Worker returned no scripts: shared_worker ") ||
            /^Coverage of \d+ shared_worker script\(s\) was not added: compiled before profiling /.test(
              error,
            ),
        ),
        JSON.stringify(browserFixture.collection.browserErrors),
      );
      assert.equal(browserFixture.collection.browserRecords, 1);
      assert.equal(browserFixture.collection.browserTestIds.length, 2);
      assert.deepEqual(browserFixture.collection.browserWorkerKinds, [
        "shared_worker",
      ]);
      const inspected = inspectJob(browserFixture);
      assert.ok(inspected.gaps.some((gap) => gap.includes("worker startup")));
      assert.equal(isComplete([{ ...browserFixture, ...inspected }]), false);
      jobs.push(browserFixture);

      await renderReports(root, join(root, "out"), sources, jobs);
      const untouched = trace(join(root, "out/lcov/untouched.info"), root);
      assert.ok(
        untouched.length > 0 && untouched.every(({ hits }) => hits === 0),
      );
      assert.ok(untouched.every(({ file }) => file !== comments));
      const layers = Object.fromEntries(
        ["unit", "integration", "e2e", "combined"].map((tier) => [
          tier,
          trace(join(root, "out/lcov", `${tier}.info`), root),
        ]),
      );
      for (const [tier, entries] of Object.entries(layers)) {
        assert.equal(
          entries.some(
            ({ file, line, hits }) =>
              file === localProduct && line === 2 && hits > 0,
          ),
          tier === "unit" || tier === "combined",
          `${tier} package-local hits`,
        );
        assert.deepEqual(
          [...new Set(entries.map(({ file }) => file))].sort(),
          sources.filter((file) => file !== comments),
          `${tier} source identities`,
        );
        assert.deepEqual(
          lineKeys(entries),
          lineKeys(layers.combined),
          `${tier} denominator`,
        );
        assert.ok(
          entries
            .filter(({ file }) => file === never || file === duplicate)
            .every(({ hits }) => hits === 0),
        );
        for (const path of [
          "index.html",
          "packages/library/src/index.html",
          "packages/duplicate/src/index.html",
          "packages/library/src/choice.ts.html",
          "packages/duplicate/src/choice.ts.html",
        ])
          assert.ok(
            existsSync(join(root, "out/report", tier, path)),
            `${tier} hierarchical HTML missing ${path}`,
          );
      }
      assertMarkers(layers.unit, ["unit"]);
      assertMarkers(layers.integration, ["integration"]);
      assertMarkers(layers.e2e, [
        "child",
        "worker",
        "bun",
        "browser",
        "packed",
      ]);
      assertMarkers(layers.combined, Object.keys(values));
      const union = [
        ...new Set(
          ["unit", "integration", "e2e"].flatMap((tier) =>
            covered(layers[tier]),
          ),
        ),
      ].sort();
      assert.deepEqual(
        covered(layers.combined),
        union,
        "LCOV combined covered lines must equal the three tier union",
      );
      verifySourceIdentity(root, sources, sourceHashes);
      assert.equal(readFileSync(join(root, product), "utf8"), code);
    } finally {
      try {
        await finishBrowser?.();
      } finally {
        try {
          await browser?.close();
        } finally {
          try {
            if (server?.listening) await close(server);
          } finally {
            retire(root);
          }
        }
      }
    }
  },
);

test("missing observations, invalid preparation and added source cannot establish completeness", () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "ph-native-boundaries-")),
  );
  try {
    run(["git", "init", "-q"], root);
    put(root, ".gitignore", "out/\n");
    const source = "packages/library/src/choice.ts";
    put(root, source, "export function answer() {\n  return 42;\n}\n");
    const sources = sourceFiles(root);
    const hashes = {
      [source]: createHash("sha256")
        .update(readFileSync(join(root, source)))
        .digest("hex"),
    };
    const item = {
      root,
      sources,
      cwd: root,
      out: join(root, "out"),
      tier: "unit",
      runner: "vitest",
      execution: { code: 0, receiptValid: true },
    };
    const selection = {
      completed: true,
      discovered: ["cases.test.ts"],
      selected: ["cases.test.ts"],
    };
    const counts = {
      numTotalTests: 1,
      numPassedTests: 1,
      numFailedTests: 0,
      numPendingTests: 0,
    };
    json(root, "out/selection.json", selection);
    json(root, "out/tests.json", counts);
    const report = put(
      root,
      "out/vitest/lcov.info",
      `SF:${join(root, source)}\nDA:2,1\nLF:1\nLH:1\nend_of_record\n`,
    );
    const inspect = (value = item, options = {}) => ({
      ...value,
      ...inspectJob(value, options),
    });
    assert.equal(
      isComplete([inspect()]),
      true,
      "Control observation must be accepted",
    );
    json(root, "out/selection.json", { ...selection, selected: [] });
    json(root, "out/tests.json", {
      ...counts,
      numTotalTests: 0,
      numPassedTests: 0,
    });
    assert.equal(
      isComplete([inspect()]),
      false,
      "An all-N/A selection is not complete",
    );
    json(root, "out/selection.json", selection);
    assert.equal(
      isComplete([inspect()]),
      false,
      "A selected suite with zero cases is not complete",
    );
    json(root, "out/tests.json", {
      ...counts,
      numPassedTests: 0,
      numPendingTests: 1,
    });
    assert.equal(
      isComplete([inspect()]),
      false,
      "An all-skipped suite is not complete",
    );
    json(root, "out/tests.json", counts);
    rmSync(report);
    const missing = inspect();
    assert.ok(
      missing.gaps.length > 0,
      "Missing native report must remain an explicit gap",
    );
    assert.equal(isComplete([missing]), false);
    put(
      root,
      "out/vitest/lcov.info",
      `SF:${join(root, source)}\nDA:2,1\nend_of_record\n`,
    );
    const invalid = inspect(
      { ...item, preparation: { code: 0, receiptValid: false } },
      { admission: true },
    );
    assert.match(invalid.gaps.join("\n"), /prepar.*receipt|receipt.*prepar/i);
    assert.equal(isComplete([invalid]), false);
    verifySourceIdentity(root, sources, hashes);
    json(root, "out/sources.json", sources);
    json(root, "out/run.json", {
      complete: true,
      sourceHashes: hashes,
      jobs: [inspect()],
    });
    put(
      root,
      "packages/library/src/added.ts",
      "export const addedAfterCollection = 1;\n",
    );
    assert.throws(
      () => verifySourceIdentity(root, sources, hashes),
      /source|selection|changed/i,
    );
    const stale = spawnSync(
      process.execPath,
      [
        join(import.meta.dirname, "run.mjs"),
        "--root",
        root,
        "--out",
        item.out,
        "--render-only",
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 10000,
        env: { ...process.env, NODE_V8_COVERAGE: "" },
      },
    );
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /Selected source set changed/);
  } finally {
    retire(root);
  }
});

test(
  "the public controller isolates consumer mutations and withholds changed product coverage",
  { timeout: 300000 },
  () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "ph-native-scenario-")),
    );
    try {
      run(["git", "init", "-q"], root);
      symlinkSync(
        join(checkout, "node_modules"),
        join(root, "node_modules"),
        "dir",
      );
      put(root, ".gitignore", "node_modules/\nout/\n");
      json(root, "package.json", { private: true, type: "module" });
      put(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
      put(
        root,
        "pnpm-workspace.yaml",
        'packages:\n  - "packages/*"\n  - "test/*"\nverifyDepsBeforeRun: false\n',
      );
      for (const owner of [
        "test/codegen",
        "test/test-connect",
        "test/vetra-e2e",
        "test/package-e2e",
        "test/workflow-piece-e2e",
        "test/recipes-e2e",
        "test/registry-e2e",
        "packages/workflow",
        "test/test-fusion",
      ])
        json(
          root,
          `${owner}/package.json`,
          read(join(checkout, owner, "package.json")),
        );
      json(root, "test/codegen/package.json", {
        name: "coverage-scenario-proof",
        scripts: {
          test: "bun test --timeout 1000000 --preload ./setup.ts ./tests",
          "test:nogenerate": "bun test --timeout 1000000 ./tests/*.test.ts",
          "generate-test-projects":
            "node -e 'if (process.env.NODE_V8_COVERAGE || Object.keys(process.env).some(k => k.startsWith(\"PH_COVERAGE_\"))) process.exit(1)'",
        },
      });
      const product = "packages/library/src/answer.ts";
      const code = "export function answer() {\n  return 42;\n}\n";
      put(root, product, code);
      put(root, "test/codegen/fixture.json", "original\n");
      put(
        root,
        "test/codegen/tests/isolation.test.ts",
        `
import {expect, test} from "bun:test";
import {spawnSync} from "node:child_process";
import {realpathSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {answer} from "../../../packages/library/src/answer.ts";
test("consumer copy", () => {
  expect(spawnSync(${JSON.stringify(process.execPath)}, ["-e", "void 0"]).status).toBe(0);
  expect(answer()).toBe(42);
  expect(realpathSync(new URL("../../../packages/library/src/answer.ts", import.meta.url))).toBe(join(process.env.PH_COVERAGE_ROOT!, "packages/library/src/answer.ts"));
  writeFileSync(new URL("../fixture.json", import.meta.url), "changed\\n");
  if (process.env.PROOF_MUTATE_PRODUCT === "1")
    writeFileSync(new URL("../../../packages/library/src/answer.ts", import.meta.url), "export function answer() { return 99; }\\n");
});
`,
      );
      put(
        root,
        "test/codegen/tests/nested/recursive.test.ts",
        'import { expect, test } from "bun:test"; import { answer } from "../../../../packages/library/src/answer.ts"; test("recursive selector executes nested cases once", () => expect(answer()).toBe(42));\n',
      );
      run(["git", "add", "."], root);
      run(
        [
          "git",
          "-c",
          "user.name=Coverage proof",
          "-c",
          "user.email=coverage-proof@example.invalid",
          "commit",
          "--no-gpg-sign",
          "-qm",
          "Fixture input",
        ],
        root,
      );
      for (const mutate of [false, true]) {
        const out = join(root, "out", mutate ? "changed" : "good");
        const result = spawnSync(
          process.execPath,
          [
            join(import.meta.dirname, "run.mjs"),
            "--root",
            root,
            "--out",
            out,
            "--suite",
            "script:test/codegen:test",
            "--bun",
            process.env.PH_COVERAGE_BUN ?? "bun",
          ],
          {
            cwd: root,
            env: {
              ...process.env,
              CI: "true",
              PROOF_MUTATE_PRODUCT: mutate ? "1" : "0",
              NODE_V8_COVERAGE: "",
            },
            encoding: "utf8",
            timeout: 120000,
            maxBuffer: 16 * 1024 * 1024,
          },
        );
        assert.equal(
          result.status,
          1,
          `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`,
        );
        const data = read(join(out, "run.json")),
          job = data.jobs[0];
        assert.equal(job.outcomes.passed, 2);
        const rawArchive = job.rawArchives.find((item) =>
          item.original.startsWith("node/"),
        );
        assert.ok(rawArchive, "Native Node child coverage must be retained");
        assert.equal(
          createHash("sha256")
            .update(gunzipSync(readFileSync(join(job.out, rawArchive.archive))))
            .digest("hex"),
          rawArchive.sha256,
        );
        assert.equal(existsSync(join(job.out, rawArchive.original)), false);
        assert.equal(existsSync(join(job.out, "application-node")), false);
        assert.equal(job.scenario.sourceHashesMatch, true);
        assert.deepEqual(
          job.scenario.changedProductSource,
          mutate ? [product] : [],
        );
        assert.ok(
          job.scenario.status.some((line) =>
            line.endsWith("test/codegen/fixture.json"),
          ),
        );
        assert.equal(
          existsSync(job.root),
          false,
          "Consumer copy must be disposed after conversion",
        );
        assert.equal(readFileSync(join(root, product), "utf8"), code);
        assert.equal(
          readFileSync(join(root, "test/codegen/fixture.json"), "utf8"),
          "original\n",
        );
        assert.equal(
          trace(join(out, "lcov/e2e.info"), root).some(
            ({ file, hits }) => file === product && hits > 0,
          ),
          !mutate,
        );
        assert.equal(data.rendering.code, 0);
        assert.equal(data.complete, false);
        assert.ok(job.gaps.some((gap) => gap.includes("nested Bun")));
      }
    } finally {
      retire(root);
    }
  },
);
