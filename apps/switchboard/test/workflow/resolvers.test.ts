// What the workflow subgraph does with the caller behind a request: every
// workflow-scoped field hands it to the runtime, and secret writes are admins'.
import type {
  Context,
  IAuthorizationService,
} from "@powerhousedao/reactor-api";
import type { WorkflowRuntimeService } from "@powerhousedao/reactor-workflow";
import { describe, expect, it, vi } from "vitest";
import { getResolvers } from "../../src/workflow/resolvers.js";

const CTX = {
  headers: {},
  db: {},
  user: { address: "0xadmin" },
} as unknown as Context;

type Resolver = (
  parent: unknown,
  args: unknown,
  ctx: Context,
) => Promise<unknown>;

function fakeRuntime() {
  return {
    webhookEndpoint: vi.fn(() => Promise.resolve(null)),
    triggerStates: vi.fn(() => Promise.resolve([])),
    runs: vi.fn(() => Promise.resolve([])),
    run: vi.fn(() => Promise.resolve(null)),
    fire: vi.fn(() => Promise.resolve({})),
    rerun: vi.fn(() => Promise.resolve({})),
    secrets: vi.fn(() =>
      Promise.resolve({
        create: vi.fn(() => Promise.resolve({ ref: "secret://v1:00" })),
        rotate: vi.fn(() => Promise.resolve({ ref: "secret://v1:00" })),
        delete: vi.fn(() => Promise.resolve()),
      }),
    ),
  };
}

function build(isAdmin: boolean) {
  const runtime = fakeRuntime();
  const authorizationService = {
    isSupremeAdmin: vi.fn(() => isAdmin),
  } as unknown as IAuthorizationService;
  const resolvers = getResolvers(
    runtime as unknown as WorkflowRuntimeService,
    authorizationService,
  ) as Record<string, Record<string, Resolver>>;
  return {
    runtime,
    queries: resolvers.WorkflowRuntimeQueries,
    mutations: resolvers.WorkflowRuntimeMutations,
  };
}

describe("the workflow resolvers and the caller", () => {
  it("hands the caller to every workflow-scoped field", async () => {
    const { runtime, queries, mutations } = build(true);

    await queries.webhookEndpoint({}, { workflowId: "wf-1" }, CTX);
    await queries.triggerStates({}, {}, CTX);
    await queries.runs({}, { driveId: "drive-1" }, CTX);
    await queries.run({}, { id: "run-1" }, CTX);
    await mutations.fire({}, { workflowId: "wf-1", payload: { a: 1 } }, CTX);
    await mutations.rerun({}, { runId: "run-1" }, CTX);

    expect(runtime.webhookEndpoint).toHaveBeenCalledWith("wf-1", CTX);
    expect(runtime.triggerStates).toHaveBeenCalledWith(CTX);
    expect(runtime.runs).toHaveBeenCalledWith({ driveId: "drive-1" }, CTX);
    expect(runtime.run).toHaveBeenCalledWith("run-1", CTX);
    expect(runtime.fire).toHaveBeenCalledWith(
      "wf-1",
      { a: 1 },
      "manual",
      undefined,
      CTX,
    );
    expect(runtime.rerun).toHaveBeenCalledWith("run-1", CTX);
  });

  it("refuses secret writes to a caller who does not administer the reactor", async () => {
    const { runtime, mutations } = build(false);

    await expect(
      mutations.createSecret({}, { value: "s3cret" }, CTX),
    ).rejects.toThrow("Admin access required");
    await expect(
      mutations.rotateSecret({}, { ref: "secret://v1:00", value: "s" }, CTX),
    ).rejects.toThrow("Admin access required");
    await expect(
      mutations.deleteSecret({}, { ref: "secret://v1:00" }, CTX),
    ).rejects.toThrow("Admin access required");
    // Refused before the store is ever opened.
    expect(runtime.secrets).not.toHaveBeenCalled();
  });

  it("lets an administrator write secrets", async () => {
    const { runtime, mutations } = build(true);

    await mutations.createSecret({}, { value: "s3cret", label: "slack" }, CTX);

    expect(runtime.secrets).toHaveBeenCalledTimes(1);
  });
});
