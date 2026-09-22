// Proves three chains through one fixture package built by `ph build`: its
// piece installed into a consumer project, served by a reactor pointed at the
// package itself, and downloaded from the registry by a reactor with nothing
// installed at all.
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTestUser,
  publishWorkspacePackages,
  REGISTRY_URL,
  startRegistry,
  stopRegistry,
  WORKSPACE_PUBLISH_PACKAGES,
} from "@powerhousedao/e2e-utils";
import { Checks } from "./lib/checks.js";
import {
  buildAndPublishFixture,
  FIXTURE_BLOCK_TYPE,
  FIXTURE_PACKAGE,
  FIXTURE_PIECE_DIR,
  FIXTURE_PUBLISHED_BLOCK_TYPE,
  FIXTURE_VERSION,
  waitForRegistryPiece,
} from "./lib/fixture.js";
import {
  createConsumerProject,
  createEmptyProject,
  startSwitchboard,
  stopSwitchboard,
  waitForSwitchboard,
  type SwitchboardHandle,
} from "./lib/project.js";
import {
  createWorkflow,
  fireWorkflow,
  pieceCatalog,
  runtimeHealth,
  searchBlocksWhenReady,
  SwitchboardClient,
  waitForRun,
} from "./lib/graphql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(ROOT, "../..");
const PH_CLI = path.join(ROOT, "node_modules/.bin/ph-cli");

// Outside the repo, so the monorepo's workspace globs never adopt either
// directory and nothing resolves back into the workspace by accident.
const WORK_DIR =
  process.env.PH_WORKFLOW_E2E_WORKDIR ?? "/tmp/ph-workflow-piece-e2e";
const FIXTURE_DIR = path.join(WORK_DIR, "fixture");
const PROJECT_DIR = path.join(WORK_DIR, "project");
// A sibling of the project above, so nothing of the install reaches it by
// walking up the tree.
const REGISTRY_PROJECT_DIR = path.join(WORK_DIR, "registry-project");
const PORT = Number(process.env.PH_WORKFLOW_E2E_PORT ?? 4021);
// The second reactor, run against the fixture package itself.
const FIXTURE_PORT = PORT + 1;
// The third, which holds nothing and fetches the piece from the registry.
const REGISTRY_PORT = PORT + 2;
const TAG = process.env.PH_TAG ?? "dev";
// For re-runs against a registry that is already up and already seeded.
const REUSE_REGISTRY = process.env.PH_WORKFLOW_E2E_REUSE_REGISTRY === "1";

const WHO = "powerhouse";
const EXPECTED_GREETING = "Hello, POWERHOUSE!";

function step(name: string): void {
  console.log(`\n━━━ ${name} ━━━`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Author a workflow whose one step is the fixture's action, run it, and check
// the journal. Returns the module the piece ran from, as the piece reports it.
async function runTheGreeter(
  client: SwitchboardClient,
  checks: Checks,
  label: string,
  blockType: string = FIXTURE_BLOCK_TYPE,
): Promise<string> {
  const workflowId = await createWorkflow(client, {
    name: `Greeter e2e (${label})`,
    trigger: { id: "trigger-1", blockType: "core#manual", config: {} },
    steps: [
      {
        id: "step-1",
        key: "greet",
        name: "Greet",
        blockType,
        config: { who: WHO },
      },
    ],
    edges: [{ id: "edge-1", from: "trigger-1", to: "step-1", port: "next" }],
  });
  console.log(`workflow document: ${workflowId}`);
  const fired = await fireWorkflow(client, workflowId, { who: WHO });
  checks.ok(
    `${label}: fire returns a run id`,
    typeof fired.runId === "string" && fired.runId.length > 0,
    () => `fire answered ${JSON.stringify(fired)}`,
  );
  const run = await waitForRun(client, fired.runId!, 120_000);
  console.log(`run ${run.id}: ${JSON.stringify(run, null, 2)}`);
  checks.equal(
    `${label}: the run is recorded as succeeded`,
    run.status,
    "SUCCEEDED",
  );
  checks.equal(`${label}: the run recorded one step`, run.steps.length, 1);
  const stepRun = run.steps[0];
  checks.equal(
    `${label}: the step names the piece's block and succeeded`,
    stepRun && [stepRun.stepKey, stepRun.blockType, stepRun.status],
    ["greet", blockType, "SUCCEEDED"],
  );
  const output = isRecord(stepRun?.output) ? stepRun.output : {};
  checks.equal(
    `${label}: the step output is what the piece's action computed`,
    [output.greeting, output.length],
    [EXPECTED_GREETING, WHO.length],
  );
  // The piece stamps its own module URL into the output, so the run itself
  // says which copy of the code the reactor loaded.
  const moduleUrl =
    typeof output.moduleUrl === "string" ? output.moduleUrl : "";
  return moduleUrl.startsWith("file:") ? fileURLToPath(moduleUrl) : moduleUrl;
}

async function main(): Promise<void> {
  let registry: ChildProcess | undefined;
  let switchboard: SwitchboardHandle | undefined;
  let fixtureReactor: SwitchboardHandle | undefined;
  let registryReactor: SwitchboardHandle | undefined;

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[cleanup] received ${signal}; tearing down`);
    stopSwitchboard(switchboard);
    stopSwitchboard(fixtureReactor);
    stopSwitchboard(registryReactor);
    if (registry) stopRegistry(registry);
    process.exit(130);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    step("1/8 Start the local registry");
    if (REUSE_REGISTRY) {
      console.log(`reusing the registry already serving ${REGISTRY_URL}`);
    } else {
      registry = await startRegistry(
        path.join(ROOT, ".registry-storage"),
        path.join(ROOT, ".registry-cdn-cache"),
        {
          localPackages: [...WORKSPACE_PUBLISH_PACKAGES, FIXTURE_PACKAGE].join(
            ",",
          ),
        },
      );
    }
    const token = await createTestUser();

    step("2/8 Publish the workspace packages");
    if (REUSE_REGISTRY) {
      console.log("skipped (PH_WORKFLOW_E2E_REUSE_REGISTRY=1)");
    } else {
      await publishWorkspacePackages({ workspaceRoot: WORKSPACE_ROOT });
    }

    step("3/8 Generate, build and publish the fixture reactor package");
    const fixture = buildAndPublishFixture({
      source: path.join(ROOT, "fixture-piece"),
      parent: FIXTURE_DIR,
      phCli: PH_CLI,
      token,
      tag: TAG,
    });

    step("4/8 Install switchboard and the fixture into a consumer project");
    createConsumerProject({
      dir: PROJECT_DIR,
      phCli: PH_CLI,
      token,
      fixtureSpec: `${FIXTURE_PACKAGE}@${FIXTURE_VERSION}`,
      tag: TAG,
    });
    // And a project that installs nothing, for the reactor that has to fetch
    // the piece from the registry to run it.
    createEmptyProject(REGISTRY_PROJECT_DIR, REGISTRY_URL);

    step("5/8 Start switchboard with workflows enabled");
    switchboard = startSwitchboard({ dir: PROJECT_DIR, port: PORT });
    // The same binary, run against the package that ships the piece rather
    // than a project that installed it. Started now so the boots overlap.
    fixtureReactor = startSwitchboard({
      dir: fixture.dir,
      port: FIXTURE_PORT,
      bin: path.join(PROJECT_DIR, "node_modules/.bin/switchboard"),
    });
    // And the same binary again, in the empty project, which names the local
    // registry in its config and installs nothing from it.
    registryReactor = startSwitchboard({
      dir: REGISTRY_PROJECT_DIR,
      port: REGISTRY_PORT,
      bin: path.join(PROJECT_DIR, "node_modules/.bin/switchboard"),
    });
    await waitForSwitchboard(switchboard, 180_000);
    const client = new SwitchboardClient(switchboard.url);
    console.log(`workflow runtime health: ${await runtimeHealth(client)}`);

    step("6/8 Check the chain through the consumer project");
    const checks = new Checks();

    console.log("\nthe build");
    checks.equal(
      "the piece bundle declares no dependencies",
      fixture.piecePackageJson.dependencies,
      {},
    );
    checks.equal(
      "the piece package.json is named and versioned after the package",
      [fixture.piecePackageJson.name, fixture.piecePackageJson.version],
      [FIXTURE_PACKAGE, FIXTURE_VERSION],
    );
    checks.equal(
      "the descriptor beside it carries the action",
      Object.keys(
        (isRecord(fixture.descriptor.actions)
          ? fixture.descriptor.actions
          : {}) as Record<string, unknown>,
      ),
      ["greet"],
    );
    checks.equal(
      "the dist manifest lists the piece and where it sits",
      fixture.manifestPieces.map((piece) => [piece.id, piece.bundle]),
      [[FIXTURE_PACKAGE, `dist/node/pieces/${FIXTURE_PIECE_DIR}`]],
    );

    console.log("\nthe install");
    const installed = path.join(PROJECT_DIR, "node_modules", FIXTURE_PACKAGE);
    checks.ok(
      "the package is installed in the consumer project",
      fs.existsSync(installed),
      () => `${installed} does not exist`,
    );
    const inWorkspace = path.join(
      WORKSPACE_ROOT,
      "node_modules",
      FIXTURE_PACKAGE,
    );
    checks.ok(
      "the package is nowhere in the workspace to be resolved from",
      !fs.existsSync(inWorkspace),
      () => `${inWorkspace} exists, so the run would not prove the install`,
    );
    const projectConfig = JSON.parse(
      fs.readFileSync(path.join(PROJECT_DIR, "powerhouse.config.json"), "utf8"),
    ) as { packages?: { packageName: string; provider?: string }[] };
    checks.equal(
      "powerhouse.config.json names the installed package",
      (projectConfig.packages ?? []).map((entry) => [
        entry.packageName,
        entry.provider,
      ]),
      [[FIXTURE_PACKAGE, "local"]],
    );

    console.log("\nthe catalog");
    const catalog = await pieceCatalog(client);
    // The workflow package's own piece: the host adds that package when
    // workflows are enabled, so this project never names it.
    checks.ok(
      "the reactor piece is registered without the project naming its package",
      catalog.some((piece) => piece.name === "@powerhousedao/piece-reactor"),
      () => `catalog held ${JSON.stringify(catalog.map((p) => p.name))}`,
    );
    const entry = catalog.find((piece) => piece.name === FIXTURE_PACKAGE);
    checks.ok(
      "pieceCatalog carries the piece the installed package ships",
      entry !== undefined,
      () => `catalog held ${JSON.stringify(catalog.map((p) => p.name))}`,
    );
    checks.equal(
      "it is described from its own code",
      entry && [
        entry.displayName,
        entry.version,
        entry.actionCount,
        entry.triggerCount,
      ],
      ["E2E Greeter", FIXTURE_VERSION, 1, 0],
    );

    const search = await searchBlocksWhenReady(client, "greet");
    const hit = search.hits.find((h) => h.blockType === FIXTURE_BLOCK_TYPE);
    checks.ok(
      "searchBlocks finds the piece's action",
      hit !== undefined,
      () =>
        `status=${search.status}, hits=${JSON.stringify(search.hits.map((h) => h.blockType))}`,
    );
    checks.equal(
      "the hit is an action of this piece",
      hit && [hit.kind, hit.pieceName, hit.displayName],
      ["action", FIXTURE_PACKAGE, "Greet"],
    );

    console.log("\nthe run");
    const ranFrom = await runTheGreeter(client, checks, "installed");
    const projectModules = path.join(
      fs.realpathSync(PROJECT_DIR),
      "node_modules",
    );
    checks.ok(
      "the piece ran from the copy installed in the consumer project",
      ranFrom.startsWith(projectModules + path.sep),
      () =>
        `ran from ${ranFrom || "(no moduleUrl in the output)"}, expected a path under ${projectModules}`,
    );
    checks.ok(
      "and from the bundle `ph build` wrote",
      ranFrom.endsWith(
        path.join("dist", "node", "pieces", FIXTURE_PIECE_DIR, "index.mjs"),
      ),
      () => `ran from ${ranFrom}`,
    );

    step("7/8 Check the same package served as the project itself");
    await waitForSwitchboard(fixtureReactor, 180_000);
    const ownClient = new SwitchboardClient(fixtureReactor.url);
    console.log(
      `workflow runtime health: ${await runtimeHealth(ownClient)} (fixture as project)`,
    );
    // The runtime serving this reactor lives in the consumer project's store,
    // nowhere under the package it is pointed at.
    checks.ok(
      "the reactor running it is installed outside the package it serves",
      !fs
        .realpathSync(path.join(PROJECT_DIR, "node_modules/.bin/switchboard"))
        .startsWith(fs.realpathSync(fixture.dir) + path.sep),
      () => "the switchboard binary resolved into the fixture package",
    );

    const ownCatalog = await pieceCatalog(ownClient);
    const ownEntry = ownCatalog.find((piece) => piece.name === FIXTURE_PACKAGE);
    checks.ok(
      "pieceCatalog carries the piece the project itself declares",
      ownEntry !== undefined,
      () =>
        `catalog held ${JSON.stringify(ownCatalog.map((p) => p.name).slice(0, 10))}`,
    );
    checks.equal(
      "described from its own code, as the installed copy was",
      ownEntry && [
        ownEntry.displayName,
        ownEntry.version,
        ownEntry.actionCount,
      ],
      ["E2E Greeter", FIXTURE_VERSION, 1],
    );

    const ownRanFrom = await runTheGreeter(ownClient, checks, "own project");
    checks.ok(
      "the piece ran from the project's own dist, not from any node_modules",
      ownRanFrom.startsWith(fs.realpathSync(fixture.dir) + path.sep) &&
        !ownRanFrom.includes(`${path.sep}node_modules${path.sep}`),
      () =>
        `ran from ${ownRanFrom || "(no moduleUrl in the output)"}, expected a path under ${fs.realpathSync(fixture.dir)}`,
    );

    step("8/8 Check the same piece served by the registry, nothing installed");
    await waitForSwitchboard(registryReactor, 180_000);
    const registryClient = new SwitchboardClient(registryReactor.url);
    console.log(
      `workflow runtime health: ${await runtimeHealth(registryClient)} (registry source)`,
    );

    console.log("\nnothing installed");
    const emptyModules = path.join(REGISTRY_PROJECT_DIR, "node_modules");
    checks.ok(
      "the project this reactor serves installed nothing at all",
      !fs.existsSync(emptyModules),
      () => `${emptyModules} exists, so the run would not prove the download`,
    );
    checks.ok(
      "and the fixture package is nowhere in the workspace either",
      !fs.existsSync(inWorkspace),
      () => `${inWorkspace} exists, so the run would not prove the download`,
    );
    const emptyConfig = JSON.parse(
      fs.readFileSync(
        path.join(REGISTRY_PROJECT_DIR, "powerhouse.config.json"),
        "utf8",
      ),
    ) as { packages?: unknown[] };
    checks.equal(
      "its powerhouse.config.json names no packages",
      emptyConfig.packages ?? [],
      [],
    );

    console.log("\nthe registry");
    const served = await waitForRegistryPiece(FIXTURE_PACKAGE);
    checks.equal(
      "the registry serves the piece on its own, out of the package that ships it",
      [served.name, served.version, served.package, served.actions],
      [FIXTURE_PACKAGE, FIXTURE_VERSION, FIXTURE_PACKAGE, 1],
    );

    console.log("\nthe catalog");
    const fetchedCatalog = await pieceCatalog(registryClient);
    const fetchedEntry = fetchedCatalog.find(
      (piece) => piece.name === FIXTURE_PACKAGE,
    );
    checks.ok(
      "pieceCatalog carries a piece this reactor never installed",
      fetchedEntry !== undefined,
      () =>
        `catalog held ${JSON.stringify(fetchedCatalog.map((p) => p.name).slice(0, 10))}`,
    );
    checks.equal(
      "described from the registry's listing",
      fetchedEntry && [
        fetchedEntry.displayName,
        fetchedEntry.version,
        fetchedEntry.actionCount,
        fetchedEntry.triggerCount,
      ],
      ["E2E Greeter", FIXTURE_VERSION, 1, 0],
    );

    const fetchedSearch = await searchBlocksWhenReady(registryClient, "greet");
    const fetchedHit = fetchedSearch.hits.find(
      (h) => h.pieceName === FIXTURE_PACKAGE,
    );
    checks.ok(
      "searchBlocks finds the piece's action",
      fetchedHit !== undefined,
      () =>
        `status=${fetchedSearch.status}, hits=${JSON.stringify(fetchedSearch.hits.map((h) => h.blockType))}`,
    );
    // A piece nobody installed is pinned by the version the block type names,
    // the way every published piece is.
    checks.equal(
      "and offers it at the published version",
      fetchedHit && [
        fetchedHit.kind,
        fetchedHit.blockType,
        fetchedHit.displayName,
      ],
      ["action", FIXTURE_PUBLISHED_BLOCK_TYPE, "Greet"],
    );

    console.log("\nthe run");
    const fetchedRanFrom = await runTheGreeter(
      registryClient,
      checks,
      "registry",
      FIXTURE_PUBLISHED_BLOCK_TYPE,
    );
    const cachedBundle = path.join(
      fs.realpathSync(REGISTRY_PROJECT_DIR),
      ".ph",
      "ap-bundles",
      `${FIXTURE_PACKAGE}-${FIXTURE_VERSION}`,
    );
    checks.ok(
      "the piece ran from the bundle the engine downloaded and cached",
      fetchedRanFrom.startsWith(cachedBundle + path.sep),
      () =>
        `ran from ${fetchedRanFrom || "(no moduleUrl in the output)"}, expected a path under ${cachedBundle}`,
    );
    checks.ok(
      "not from a copy installed anywhere",
      !fetchedRanFrom.includes(`${path.sep}node_modules${path.sep}`),
      () => `ran from ${fetchedRanFrom}`,
    );

    checks.report();
    console.log("\n✅ test-workflow-piece-e2e: all green\n");
  } finally {
    if (registryReactor) {
      console.log("\n[cleanup] stop the registry-sourced switchboard");
      stopSwitchboard(registryReactor);
    }
    if (fixtureReactor) {
      console.log("\n[cleanup] stop the fixture-package switchboard");
      stopSwitchboard(fixtureReactor);
    }
    if (switchboard) {
      console.log("\n[cleanup] stop switchboard");
      stopSwitchboard(switchboard);
    }
    if (registry) {
      console.log("[cleanup] stop registry");
      stopRegistry(registry);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
