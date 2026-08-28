import { describe, expect, it, vi } from "vitest";
import type { IReactorClient } from "../../src/client/types.js";
import {
  createReactorHostModuleBase,
  type ReactorHostModuleBaseOptions,
} from "../../src/processors/host-module.js";

describe("createReactorHostModuleBase", () => {
  const executeAsync = vi
    .fn()
    .mockResolvedValue({ id: "job-1", status: "PENDING", createdAt: "x" });
  const client = { executeAsync } as unknown as IReactorClient;
  const documentView = { name: "document-view" };
  const module = createReactorHostModuleBase({
    client,
    readModels: [documentView, { name: "document-indexer" }],
    relationalDb: {} as ReactorHostModuleBaseOptions["relationalDb"],
    analyticsStore: {} as ReactorHostModuleBaseOptions["analyticsStore"],
    processorApp: "switchboard",
  });

  it("passes core fields and the client through", () => {
    expect(module.client).toBe(client);
    expect(module.processorApp).toBe("switchboard");
  });

  it("dispatches through client.executeAsync and returns id and status only", async () => {
    const signal = new AbortController().signal;
    const result = await module.dispatch.execute("doc", "main", [], signal);
    expect(executeAsync).toHaveBeenCalledWith("doc", "main", [], signal);
    expect(result).toEqual({ id: "job-1", status: "PENDING" });
  });

  it("resolves read models by name and throws on unknown names", () => {
    expect(module.getReadModel("document-view")).toBe(documentView);
    expect(() => module.getReadModel("missing")).toThrow(
      'Read model "missing" not found',
    );
  });
});
