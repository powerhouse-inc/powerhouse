// Losing the workflow singleton claim must not take the whole API down.
//
// It used to: WorkflowSingletonConflictError propagated out of startSwitchboard
// and aborted the boot. With the old random per-process owner name, an unclean
// kill left a lease nobody could re-claim, so every restart inside the 60s TTL
// crash-looped the entire Switchboard — inspection, GraphQL, sync and all —
// over a component this host is merely not allowed to run.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as WorkflowEngine from "@powerhousedao/reactor-workflow";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";

const HOLDER = "another-live-replica";
const HELD_UNTIL = "2030-01-01T00:00:00.000Z";

// The lease itself is the engine's to test (reactor-workflow,
// singleton-lease.test.ts). What is under test here is what THIS host does
// when the claim is refused, so only the claim is faked.
vi.mock("@powerhousedao/reactor-workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof WorkflowEngine>();
  return {
    ...actual,
    acquireWorkflowSingletonLease: () => {
      const error = new Error(
        `Workflow execution is a singleton and "${HOLDER}" holds it until ${HELD_UNTIL}`,
      );
      error.name = "WorkflowSingletonConflictError";
      return Promise.reject(
        Object.assign(error, {
          owner: HOLDER,
          expiresAt: HELD_UNTIL,
          wouldBe: "this-host",
        }),
      );
    },
  };
});

const { startSwitchboard } = await import("../src/server.mjs");

function stubLogger(): ILogger & { warn: ReturnType<typeof vi.fn> } {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger & { warn: ReturnType<typeof vi.fn> };
}

// Off the public boot type: the inspection source the API hands back, which
// the workflow runtime flips once it is composed.
function inspectionInfo(
  switchboard: Awaited<ReturnType<typeof startSwitchboard>>,
) {
  return (
    switchboard as unknown as {
      api: { inspection?: { info: () => { workflows: boolean } } };
    }
  ).api.inspection?.info();
}

describe("booting Switchboard when another process holds the singleton", () => {
  it("boots the API without the workflow runtime, naming the owner", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-wf-conflict-"));
    const previousReactorDb = process.env.PH_REACTOR_DATABASE_URL;
    process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
    const logger = stubLogger();
    let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;

    try {
      // The boot RESOLVES. That is the whole finding.
      switchboard = await startSwitchboard({
        workflows: { enabled: true },
        dbPath: join(tempRoot, "read-model"),
        port: 0,
        mcp: false,
        disableLocalPackages: true,
        identity: { keypairPath: join(tempRoot, "identity.json") },
        logger,
      });

      // The API is up and serving: the reactor answers, the document models
      // are registered, everything but workflows works.
      const { results } = await switchboard.reactor.getDocumentModelModules();
      expect(results.length).toBeGreaterThan(0);

      // And the runtime is absent, said so rather than half-present.
      expect(switchboard.workflowTriggers).toBeUndefined();
      expect(inspectionInfo(switchboard)?.workflows).toBe(false);

      // Warned, not errored into silence, and the warning names who holds it
      // and how to get workflows back.
      const warning = logger.warn.mock.calls
        .map((call) => String(call[0]))
        .find((line) => line.includes("workflow singleton"));
      expect(warning).toBeDefined();
      expect(warning).toContain(HOLDER);
      expect(warning).toContain(HELD_UNTIL);
      expect(warning).toContain("WITHOUT the workflow runtime");
      expect(warning).toContain("PH_WORKFLOWS_SINGLETON_OWNER");

      await switchboard.shutdown();
      switchboard = undefined;
    } finally {
      await switchboard?.shutdown();
      if (previousReactorDb === undefined) {
        delete process.env.PH_REACTOR_DATABASE_URL;
      } else {
        process.env.PH_REACTOR_DATABASE_URL = previousReactorDb;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
