import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as RuntimeUrlModule from "./runtime-url.js";

const resolveDriveSwitchboard = vi.fn();

vi.mock("@powerhousedao/reactor-browser/ai", () => ({
  resolveDriveSwitchboard,
}));

const setRuntimeUrl = vi.fn();

vi.mock("../editors/workflow-editor/runtime-api.js", () => ({
  DEFAULT_RUNTIME_URL: "http://localhost:4001/graphql/workflow-runtime",
  setRuntimeUrl,
}));

let runtimeUrl: typeof RuntimeUrlModule;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  runtimeUrl = await import("./runtime-url.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncRuntimeUrl", () => {
  it("points at the resolved switchboard's workflow-runtime subgraph", () => {
    vi.stubGlobal("window", { ph: { selectedDriveId: "drive-1" } });
    resolveDriveSwitchboard.mockReturnValue({
      switchboardUrl: "http://remote:4001",
      graphqlUrl: "http://remote:4001/graphql",
    });

    runtimeUrl.syncRuntimeUrl();

    expect(setRuntimeUrl).toHaveBeenCalledWith(
      "http://remote:4001/graphql/workflow-runtime",
    );
  });

  it("resets to the default when switching to a drive with no switchboard", () => {
    vi.stubGlobal("window", { ph: { selectedDriveId: "drive-1" } });
    resolveDriveSwitchboard.mockReturnValue({
      switchboardUrl: "http://remote:4001",
      graphqlUrl: "http://remote:4001/graphql",
    });
    runtimeUrl.syncRuntimeUrl();

    // Switch to a local/unsynced drive: no switchboard resolves.
    resolveDriveSwitchboard.mockReturnValue(undefined);
    runtimeUrl.syncRuntimeUrl();

    expect(setRuntimeUrl).toHaveBeenLastCalledWith(
      "http://localhost:4001/graphql/workflow-runtime",
    );
  });

  it("does nothing outside the browser", () => {
    runtimeUrl.syncRuntimeUrl();
    expect(setRuntimeUrl).not.toHaveBeenCalled();
  });
});
