import type { IReactorClient } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import * as resolvers from "../src/graphql/reactor/resolvers.js";

describe("undoRedoTargets resolver", () => {
  it("asks the client as the caller, so the client's read gate decides", async () => {
    const undoRedoTargets = vi
      .fn()
      .mockResolvedValue({ undoTarget: "action-1" });
    const client = { undoRedoTargets } as unknown as IReactorClient;
    const subject = { address: "0xcaller" };

    expect(
      await resolvers.undoRedoTargets(
        client,
        { documentIdOrSlug: "doc-1", scope: "local", branch: null },
        subject,
      ),
    ).toEqual({ undoTarget: "action-1", redoTarget: null });
    expect(undoRedoTargets).toHaveBeenCalledWith("doc-1", "local", {
      branch: undefined,
      subject,
    });
  });
});
