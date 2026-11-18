import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { matchesGlob, relative, resolve } from "node:path";
import { ownerOf } from "./scope.mjs";

export function postgresEnv(database) {
  const url = new URL(database);
  return {
    REACTOR_TEST_PG_URL: database,
    REACTOR_TEST_PG_HOST: url.hostname,
    REACTOR_TEST_PG_PORT: url.port,
    REACTOR_TEST_PG_USER: decodeURIComponent(url.username),
    REACTOR_TEST_PG_PASSWORD: decodeURIComponent(url.password),
    REACTOR_TEST_PG_DATABASE: url.pathname.slice(1),
  };
}

export const tierPolicy = "declared-test-levels/2";
export const tierRules = [
  ["unit", "**/{unit,*.unit}.{test,spec}.*"],
  ["integration", "**/{integration,*.integration}.{test,spec}.*"],
  ["e2e", "**/{e2e,*.e2e}.{test,spec}.*", "**/e2e/**"],
  [
    "e2e",
    "test/{codegen,vetra-e2e,package-e2e,workflow-piece-e2e,registry-e2e,recipes-e2e,switchboard,test-fusion}/**",
    "packages/workflow/**/*.spec.*",
  ],
  [
    "integration",
    "**/*integration*.{test,spec}.*",
    "**/{integration,integrations}/**",
    "packages/analytics-engine/{browser,compat,knex,pg}/**",
    "packages/{reactor,reactor-api,reactor-attachments,reactor-browser,reactor-drive,reactor-hypercore,reactor-privacy,reactor-workflow}/test/**",
    "test/{test-client,test-connect}/**",
    "scripts/**/*.test.*",
  ],
];

export const componentSpecs = [
  "packages/workflow/test/ui/prop-controls.spec.ts",
  "packages/workflow/test/ui/property-form-echo.spec.ts",
  "packages/workflow/test/ui/schedule-builder.spec.ts",
];
const reviewed = [
  [
    "packages/reactor-workflow/src/reactor/oauth.test.ts",
    "integration",
    ["live-service"],
    "Mixed pure tokenDue cases and local HTTP/HTTPS OAuth service cases; one containing level.",
    "mixed",
  ],
  [
    "packages/reactor-monitor/test/build-reactor.test.ts",
    "integration",
    ["live-service"],
    "Mixed isolated lock/error cases and real PGlite reactor transactions; one containing level.",
    "mixed",
  ],
  [
    "packages/reactor-api/test/drive-middleware.test.ts",
    "unit",
    ["contract"],
    "Isolates the HTTP middleware with a fake reactor and a stubbed next handler.",
  ],
  [
    "packages/registry/tests/e2e.test.ts",
    "e2e",
    ["contract", "live-service"],
    "Starts the registry and checks publishing through real HTTP requests.",
  ],
  [
    "packages/registry/tests/migrations.test.ts",
    "integration",
    ["live-service"],
    "Mixed pure migrateOnBoot cases and actual PGlite/PostgreSQL migration cases; one containing level.",
    "mixed",
  ],
  ...componentSpecs.map((file) => [
    file,
    "unit",
    ["ui"],
    "Exercises one component through the existing standalone harness.",
  ]),
  ...[
    "packages/registry/tests/worker.test.ts",
    "packages/reactor-workflow/src/reactor/singleton-lease.pg.test.ts",
    "packages/reactor-workflow/src/reactor/workflow-triggers-read-model.purge.test.ts",
  ].map((file) => [
    file,
    "integration",
    ["live-service"],
    "Uses an actual database or local HTTP service.",
  ]),
  [
    "packages/workflow/ai/workflow-tools.live.test.ts",
    "integration",
    ["live-service"],
    "Opt-in requests to a running Workflow runtime.",
  ],
  [
    "clis/ph-cli/test/connect-studio-reload.test.ts",
    "e2e",
    ["ui", "consumer"],
    "Starts the built CLI and checks the served application after an edit.",
  ],
  [
    "clis/ph-cli/test/host-check.test.ts",
    "integration",
    ["smoke"],
    "Mixed pure checks and actual runner/process checks; one containing level.",
    "mixed",
  ],
  [
    "tools/doc-harness/test/workspace.test.ts",
    "integration",
    ["consumer", "live-service"],
    "Mixed fake-installer unit cases and opt-in real package installation; one containing level.",
    "mixed",
  ],
];
const labelRules = [
  ["ui", "packages/design-system/**", "packages/workflow/test/ui/**"],
  ["contract", "**/*{contract,schema}*.{test,spec}.*"],
  [
    "consumer",
    "test/{codegen,package-e2e,workflow-piece-e2e,recipes-e2e,registry-e2e,test-fusion}/**",
  ],
  ["codegen", "test/codegen/**"],
  ["smoke", "**/*{smoke,studio-boot}*.{test,spec}.*"],
  ["live-service", "**/*.live.test.*"],
  ["property", "**/*.property.{test,spec}.*", "**/*-property.{test,spec}.*"],
  [
    "golden",
    "**/*.golden.{test,spec}.*",
    "**/*-golden.{test,spec}.*",
    "packages/design-system/src/ui/components/button/button.test.tsx",
    "**/*.snapshot.{test,spec}.*",
  ],
];

export function classifyTest(file) {
  const override = reviewed.find(([path]) => path === file);
  const rule = tierRules.find(([, ...patterns]) =>
    patterns.some((pattern) => matchesGlob(file, pattern)),
  );
  return {
    file,
    tier: override?.[1] ?? rule?.[0] ?? "unit",
    basis:
      override?.[4] ??
      (override
        ? "source-reviewed"
        : rule && tierRules.indexOf(rule) < 3
          ? "declared-path"
          : "legacy-unreviewed"),
    labels: [
      ...new Set([
        ...(override?.[2] ?? []),
        ...labelRules
          .filter(([, ...patterns]) =>
            patterns.some((pattern) => matchesGlob(file, pattern)),
          )
          .map(([label]) => label),
      ]),
    ].sort(),
    ...(override ? { reason: override[3] } : {}),
  };
}
export const tierOf = (file) => classifyTest(file).tier;

const scenarios = [
  [
    "test/codegen",
    "test",
    "e2e",
    "bun",
    "generate-test-projects",
    "test:nogenerate",
  ],
  ["test/test-connect", "test:integration", "integration", "custom"],
  ["test/vetra-e2e", "test", "e2e", "playwright"],
  ["test/vetra-e2e", "test:worker", "e2e", "playwright"],
  ["test/vetra-e2e", "test:classic", "e2e", "playwright"],
  ["test/package-e2e", "test", "e2e", "custom"],
  ["test/workflow-piece-e2e", "test", "e2e", "custom"],
  ["test/recipes-e2e", "recipes", "e2e", "custom"],
  ["test/registry-e2e", "test", "e2e", "custom"],
  ["packages/workflow", "test:ui", "unit", "playwright"],
  ["packages/workflow", "test:ui", "e2e", "playwright"],
  ["test/test-fusion", "test:e2e", "e2e", "playwright"],
];

export function discoverSuites(root) {
  root = realpathSync(resolve(root));
  const paths = [
    ...new Set(
      execFileSync(
        "git",
        [
          "-C",
          root,
          "ls-files",
          "-z",
          "--cached",
          "--others",
          "--exclude-standard",
        ],
        { maxBuffer: 32 * 1024 * 1024 },
      )
        .toString()
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  const read = (path) => readFileSync(resolve(root, path), "utf8");
  const workspaces = JSON.parse(
    execFileSync("pnpm", ["list", "--recursive", "--depth", "-1", "--json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    }),
  );
  const packages = new Map(
    workspaces
      .map(({ path }) => relative(root, path).replaceAll("\\", "/"))
      .filter(Boolean)
      .map((owner) => [owner, JSON.parse(read(`${owner}/package.json`))]),
  );
  const owners = [...packages.keys()].sort((a, b) => b.length - a.length);
  const ownerFor = (file) =>
    owners.find((owner) => file.startsWith(owner + "/"));
  const candidates = paths.filter(
    (path) =>
      /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) &&
      existsSync(resolve(root, path)) &&
      !/^(?:tools\/(?:coverage|coverage-baseline|test-coverage)|tools\/doc-harness\/catalog\/pinned)\//.test(
        path,
      ),
  );
  const native = candidates.filter((path) => {
    const source = read(path);
    return (
      /from\s*["']node:test["']/.test(source) &&
      !/from\s*["'](?:vitest|@vitest\/)/.test(source)
    );
  });
  const jobs = [];
  for (const [owner, pkg] of packages) {
    const scripts = pkg.scripts ?? {};
    const scriptName = ["test", "test:pg"].find((name) =>
      /\bvitest\b/.test(scripts[name] ?? ""),
    );
    if (!scriptName) {
      if (
        scripts.test &&
        !scenarios.some(([path, script]) => path === owner && script === "test")
      )
        throw new Error(`Unregistered test command: ${owner}: ${scripts.test}`);
      continue;
    }
    const owned = candidates.filter(
      (path) =>
        ownerFor(path) === owner &&
        !native.includes(path) &&
        !(owner === "packages/workflow" && path.endsWith(".spec.ts")) &&
        !path.endsWith("/hub-spoke-catchup.integration.test.ts"),
    );
    for (const tier of ["unit", "integration", "e2e"])
      jobs.push({
        id: `vitest:${owner}:${tier}`,
        owner,
        tier,
        runner: "vitest",
        cwd: resolve(root, owner),
        args: ["pnpm", "run", scriptName],
        command: scripts[scriptName],
        files: owned.filter((path) => tierOf(path) === tier),
        env: {},
        scriptName,
        originalScript: scripts[scriptName],
      });
    if (owner === "packages/reactor-api") {
      const scriptName = "test:integration";
      if (!/\bvitest\b/.test(scripts[scriptName] ?? ""))
        throw new Error("The native hub/spoke entrypoint is missing");
      jobs.push({
        id: `vitest:${owner}:${scriptName}`,
        owner,
        tier: "integration",
        runner: "vitest",
        cwd: resolve(root, owner),
        args: ["pnpm", "run", scriptName],
        command: scripts[scriptName],
        files: candidates.filter(
          (path) =>
            ownerFor(path) === owner &&
            path.endsWith("/hub-spoke-catchup.integration.test.ts"),
        ),
        env: {},
        scriptName,
        originalScript: scripts[scriptName],
      });
    }
  }
  for (const path of native)
    jobs.push({
      id: `node:${path}`,
      owner: ownerOf(path),
      tier: tierOf(path),
      runner: "node",
      cwd: root,
      files: [path],
      args: [
        "node",
        ...(/\.[cm]?tsx?$/.test(path) ? ["--import", "tsx"] : []),
        "--test",
        resolve(root, path),
      ],
      env: {},
    });
  for (const [
    owner,
    scriptName,
    tier,
    runner,
    prepareScript,
    runScript = scriptName,
  ] of scenarios) {
    if (!packages.has(owner)) continue;
    const scripts = packages.get(owner).scripts ?? {};
    for (const name of [scriptName, prepareScript, runScript].filter(Boolean))
      if (!scripts[name])
        throw new Error(
          `Required scenario script is missing: ${owner}:${name}`,
        );
    const files = candidates.filter(
      (path) =>
        ownerFor(path) === owner &&
        !native.includes(path) &&
        (owner !== "packages/workflow" ||
          (path.endsWith(".spec.ts") && tierOf(path) === tier)),
    );
    const job = {
      id: `script:${owner}:${scriptName}${owner === "packages/workflow" && tier === "unit" ? ":components" : ""}`,
      owner,
      tier,
      runner,
      cwd: resolve(root, owner),
      files,
      args: ["pnpm", "run", runScript],
      env: {},
      scriptName,
      originalScript: scripts[scriptName],
      executionScript: scripts[runScript],
    };
    if (prepareScript) job.prepare = ["pnpm", "run", prepareScript];
    if (runner === "bun") job.args.push("./tests");
    if (owner === "test/test-fusion") {
      const match = scripts[scriptName].match(
        /^(.*)\s*&&\s*playwright test\s*$/s,
      );
      if (!match)
        throw new Error(
          "Fusion preparation boundary changed; package script was left unchanged",
        );
      job.prepare = ["sh", "-c", match[1]];
      job.args = ["pnpm", "exec", "playwright", "test"];
    }
    if (owner === "packages/workflow")
      job.args.push(
        ...files.map((file) =>
          relative(resolve(root, owner), resolve(root, file)),
        ),
      );
    jobs.push(job);
  }
  for (const job of jobs) {
    job.classification = job.files.map(classifyTest);
    job.labels = [
      ...new Set(job.classification.flatMap(({ labels }) => labels)),
    ].sort();
    const hub =
      job.owner === "packages/reactor-api" &&
      job.scriptName === "test:integration";
    const databases = (
      (hub
        ? process.env.PH_COVERAGE_HUB_PG_URL
        : process.env.PH_COVERAGE_REACTOR_PG_URL) ?? ""
    )
      .split(/[\s,]+/)
      .filter(Boolean);
    if (databases.length) Object.assign(job.env, postgresEnv(databases[0]));
    // Several clusters form a pool: each native lease takes one free cluster.
    if (databases.length > 1) job.postgresPool = databases;
    if (process.env.PH_COVERAGE_ANALYTICS_PG_URL)
      job.env.PG_CONNECTION_STRING = process.env.PH_COVERAGE_ANALYTICS_PG_URL;
  }
  return jobs;
}
