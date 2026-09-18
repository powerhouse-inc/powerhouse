// Proves one chain: a piece shipped inside a reactor package, built by
// `ph build`, published to a local registry, installed from it, and run.
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
  FIXTURE_VERSION,
} from "./lib/fixture.js";
import {
  createConsumerProject,
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
const PORT = Number(process.env.PH_WORKFLOW_E2E_PORT ?? 4021);
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

async function main(): Promise<void> {
  let registry: ChildProcess | undefined;
  let switchboard: SwitchboardHandle | undefined;

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[cleanup] received ${signal}; tearing down`);
    stopSwitchboard(switchboard);
    if (registry) stopRegistry(registry);
    process.exit(130);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    step("1/6 Start the local registry");
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

    step("2/6 Publish the workspace packages");
    if (REUSE_REGISTRY) {
      console.log("skipped (PH_WORKFLOW_E2E_REUSE_REGISTRY=1)");
    } else {
      await publishWorkspacePackages({ workspaceRoot: WORKSPACE_ROOT });
    }

    step("3/6 Generate, build and publish the fixture reactor package");
    const fixture = buildAndPublishFixture({
      source: path.join(ROOT, "fixture-piece"),
      parent: FIXTURE_DIR,
      phCli: PH_CLI,
      token,
      tag: TAG,
    });

    step("4/6 Install switchboard and the fixture into a consumer project");
    createConsumerProject({
      dir: PROJECT_DIR,
      phCli: PH_CLI,
      token,
      fixtureSpec: `${FIXTURE_PACKAGE}@${FIXTURE_VERSION}`,
      tag: TAG,
    });

    step("5/6 Start switchboard with workflows enabled");
    switchboard = startSwitchboard({ dir: PROJECT_DIR, port: PORT });
    await waitForSwitchboard(switchboard, 180_000);
    const client = new SwitchboardClient(switchboard.url);
    console.log(`workflow runtime health: ${await runtimeHealth(client)}`);

    step("6/6 Check the chain");
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
    const workflowId = await createWorkflow(client, {
      name: "Greeter e2e",
      trigger: { id: "trigger-1", blockType: "core#manual", config: {} },
      steps: [
        {
          id: "step-1",
          key: "greet",
          name: "Greet",
          blockType: FIXTURE_BLOCK_TYPE,
          config: { who: WHO },
        },
      ],
      edges: [{ id: "edge-1", from: "trigger-1", to: "step-1", port: "next" }],
    });
    console.log(`workflow document: ${workflowId}`);
    const fired = await fireWorkflow(client, workflowId, { who: WHO });
    checks.ok(
      "fire returns a run id",
      typeof fired.runId === "string" && fired.runId.length > 0,
      () => `fire answered ${JSON.stringify(fired)}`,
    );
    const run = await waitForRun(client, fired.runId!, 120_000);
    console.log(`run ${run.id}: ${JSON.stringify(run, null, 2)}`);
    checks.equal("the run is recorded as succeeded", run.status, "SUCCEEDED");
    checks.equal("the run recorded one step", run.steps.length, 1);
    const stepRun = run.steps[0];
    checks.equal(
      "the step names the piece's block and succeeded",
      stepRun && [stepRun.stepKey, stepRun.blockType, stepRun.status],
      ["greet", FIXTURE_BLOCK_TYPE, "SUCCEEDED"],
    );
    const output = isRecord(stepRun?.output) ? stepRun.output : {};
    checks.equal(
      "the step output is what the piece's action computed",
      [output.greeting, output.length],
      [EXPECTED_GREETING, WHO.length],
    );

    // The piece stamps its own module URL into the output, so the run itself
    // says which copy of the code the reactor loaded.
    const moduleUrl =
      typeof output.moduleUrl === "string" ? output.moduleUrl : "";
    const ranFrom = moduleUrl.startsWith("file:")
      ? fileURLToPath(moduleUrl)
      : moduleUrl;
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

    checks.report();
    console.log("\n✅ test-workflow-piece-e2e: all green\n");
  } finally {
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
