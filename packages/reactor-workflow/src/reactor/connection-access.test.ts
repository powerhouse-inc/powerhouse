// The design-time surfaces that hand a connection's credentials to piece code
// authorize their caller, because nothing in the request itself does.
import type { WorkflowRuntimeHostDeps } from "./host.js";
import { describe, expect, it, vi } from "vitest";
import { testRuntime } from "../../test/helpers/runtime.js";

const BLOCK = "@acme/piece-slack@1.0.0#send_message";
const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

function connectionSummaryDocument(id: string) {
  return {
    header: { id, documentType: "powerhouse/connection" },
    state: {
      global: {
        name: id,
        connectorId: "@acme/piece-slack#slack",
        authType: "SECRET_TEXT",
        config: {},
        secretRefs: [],
        status: "OK",
        accountLabel: null,
      },
    },
  };
}

// Only "conn-mine" is readable; "conn-theirs" belongs to someone else.
const assertCanRead = vi.fn((documentId: string) =>
  documentId === "conn-mine"
    ? Promise.resolve({})
    : Promise.reject(new Error("forbidden")),
);

const get = vi.fn(() =>
  Promise.resolve(connectionSummaryDocument("conn-mine")),
);

const runtime = testRuntime({
  reactorClient: {
    get,
    execute: vi.fn(),
    find: vi.fn(() => ({
      results: [
        connectionSummaryDocument("conn-mine"),
        connectionSummaryDocument("conn-theirs"),
      ],
    })),
  },
  assertCanRead,
} as unknown as WorkflowRuntimeHostDeps);

describe("design-time connection access", () => {
  it("refuses blockOptions for a connection the caller cannot read", async () => {
    await expect(
      runtime.blockOptions(BLOCK, "channel", {}, "conn-theirs", CTX),
    ).rejects.toThrow("forbidden");
    // Refused before the credentials are ever fetched.
    expect(get).not.toHaveBeenCalled();
  });

  it("refuses blockOptions when the request carries no caller", async () => {
    await expect(
      runtime.blockOptions(BLOCK, "channel", {}, "conn-theirs"),
    ).rejects.toThrow("authenticated request");
  });

  it("leaves a connection-less blockOptions call alone", async () => {
    // No connectionId, so nothing to authorize; it fails later, on the bundle.
    await expect(
      runtime.blockOptions(BLOCK, "channel", {}, undefined, CTX),
    ).rejects.not.toThrow(/forbidden|authenticated request/);
  });

  it("refuses testTrigger for a workflow the caller cannot read", async () => {
    await expect(runtime.testTrigger("wf-theirs", CTX)).rejects.toThrow(
      "forbidden",
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("refuses testTrigger when the request carries no caller", async () => {
    await expect(runtime.testTrigger("wf-theirs")).rejects.toThrow(
      "authenticated request",
    );
  });

  it("refuses testTrigger when only the trigger's connection is off limits", async () => {
    get.mockResolvedValueOnce({
      header: { id: "conn-mine", documentType: "powerhouse/workflow" },
      state: {
        global: {
          trigger: { id: "t", blockType: BLOCK, connectionId: "conn-theirs" },
        },
      },
    } as never);

    // The workflow is readable; the credentials it would resolve are not.
    await expect(runtime.testTrigger("conn-mine", CTX)).rejects.toThrow(
      "forbidden",
    );
  });

  it("lists only the connections the caller may read", async () => {
    const listed = await runtime.connections(CTX);

    expect(listed.map((entry) => entry.id)).toEqual(["conn-mine"]);
  });

  it("lists nothing to a caller it cannot identify", async () => {
    expect(await runtime.connections()).toEqual([]);
  });
});
