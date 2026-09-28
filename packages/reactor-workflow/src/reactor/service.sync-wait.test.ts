// A workflow asked about before it has synced here: a caller allowed on the
// drive waits for it; anyone else is refused at once. Real in-process reactor.
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testRuntime } from "../../test/helpers/runtime.js";
import type { WorkflowRuntimeService } from "./service.js";
import { WORKFLOW_SYNCING_MESSAGE, WorkflowSyncingError } from "./sync-wait.js";

const MEMBER = "0xmember";
const OUTSIDER = "0xoutsider";
const DRIVE = "drive-sync";
const PRIVATE = "wf-private";
const FORBIDDEN = "Forbidden: insufficient permissions to read this document";

const ctx = (address: string) =>
  ({ headers: {}, db: {}, user: { address } }) as never;

let module: InProcessReactorClientModule;
let service: WorkflowRuntimeService;

async function createDocument(id: string) {
  await module.client.create(
    withSignaturePolicy(
      documentModelDocumentModelModule.utils.createDocument(),
      "legacy",
      { id },
    ),
  );
}

async function timed(
  call: () => Promise<unknown>,
): Promise<{ value?: unknown; error?: unknown; ms: number }> {
  const started = Date.now();
  const outcome = await call().then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  return { ...outcome, ms: Date.now() - started };
}

beforeAll(async () => {
  module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule as unknown as DocumentModelModule,
      ]),
    )
    .buildModule();
  await createDocument(DRIVE);
  await createDocument(PRIVATE);
  const client = module.client;
  // The host's shape: an unknown document is a denial, like any other.
  const assertCanRead = async (id: string, caller: object) => {
    const address = (caller as { user?: { address?: string } }).user?.address;
    if (address !== MEMBER || id === PRIVATE) throw new Error(FORBIDDEN);
    try {
      await client.get(id);
    } catch {
      throw new Error(FORBIDDEN);
    }
  };
  service = testRuntime({
    reactorClient: client,
    assertCanRead,
    syncWaitMs: 1_500,
  });
});

afterAll(() => {
  service.shutdown();
  module.reactor.kill();
});

describe("a workflow not synced here yet", () => {
  it("waits for it when the caller is allowed on the drive", async () => {
    const id = "wf-arriving";
    setTimeout(() => void createDocument(id), 400);

    const outcome = await timed(() =>
      service.webhookEndpoint(id, ctx(MEMBER), { driveId: DRIVE }),
    );

    expect(outcome).toMatchObject({ value: null });
    expect(outcome.ms).toBeGreaterThanOrEqual(350);
  });

  it("says it is still syncing when it never arrives", async () => {
    const outcome = await timed(() =>
      service.webhookEndpoint("wf-never", ctx(MEMBER), { driveId: DRIVE }),
    );

    expect(outcome.error).toBeInstanceOf(WorkflowSyncingError);
    expect((outcome.error as Error).message).toBe(WORKFLOW_SYNCING_MESSAGE);
    expect(outcome.ms).toBeGreaterThanOrEqual(1_400);
  });

  it("applies to step and trigger tests", async () => {
    await expect(
      service.testStep("wf-never", "s1", ctx(MEMBER), { driveId: DRIVE }),
    ).rejects.toThrow(WORKFLOW_SYNCING_MESSAGE);
    await expect(
      service.testTrigger("wf-never", ctx(MEMBER), { driveId: DRIVE }),
    ).rejects.toThrow(WORKFLOW_SYNCING_MESSAGE);
  });
});

describe("a caller without permission", () => {
  it("is refused at once when not allowed on the drive", async () => {
    const outcome = await timed(() =>
      service.testStep("wf-never", "s1", ctx(OUTSIDER), { driveId: DRIVE }),
    );

    expect((outcome.error as Error).message).toBe(FORBIDDEN);
    expect(outcome.ms).toBeLessThan(150);
  });

  it("is refused at once for a workflow already here", async () => {
    const outcome = await timed(() =>
      service.testTrigger(PRIVATE, ctx(MEMBER), { driveId: DRIVE }),
    );

    expect((outcome.error as Error).message).toBe(FORBIDDEN);
    expect(outcome.ms).toBeLessThan(150);
  });

  it("is refused at once when no drive is named", async () => {
    const outcome = await timed(() =>
      service.webhookEndpoint("wf-never", ctx(MEMBER)),
    );

    expect((outcome.error as Error).message).toBe(FORBIDDEN);
    expect(outcome.ms).toBeLessThan(150);
  });
});
