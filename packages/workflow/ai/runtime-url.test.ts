import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDriveWindow } from "../test/drive-window.js";
import { schemaFetch } from "../test/runtime-schema.js";
import type * as RuntimeApiModule from "../editors/workflow-editor/runtime-api.js";
import type * as RuntimeUrlModule from "./runtime-url.js";

const DEFAULT_URL = "http://localhost:4001/graphql/workflow-runtime";

const installWindow = (
  selectedDriveId: string,
  remotes: Record<string, string>,
) => installDriveWindow({ selectedDriveId, remotes });

let runtimeUrl: typeof RuntimeUrlModule;
let runtimeApi: typeof RuntimeApiModule;
let server: ReturnType<typeof schemaFetch>;

beforeEach(async () => {
  vi.resetModules();
  server = schemaFetch({ connections: [] });
  vi.stubGlobal("fetch", server.fetch);
  runtimeUrl = await import("./runtime-url.js");
  runtimeApi = await import("../editors/workflow-editor/runtime-api.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Where the ambient client's next request goes.
async function requestUrl(): Promise<string> {
  await runtimeApi.fetchConnections();
  return server.sent.at(-1)!.url;
}

describe("syncRuntimeUrl", () => {
  it("points at the resolved switchboard's workflow-runtime subgraph", async () => {
    installWindow("drive-1", { "drive-1": "http://remote:4001/graphql/r" });

    runtimeUrl.syncRuntimeUrl();

    expect(await requestUrl()).toBe(
      "http://remote:4001/graphql/workflow-runtime",
    );
  });

  it("resets to the default when switching to a drive with no switchboard", async () => {
    installWindow("drive-1", { "drive-1": "http://remote:4001/graphql/r" });
    runtimeUrl.syncRuntimeUrl();
    expect(await requestUrl()).not.toBe(DEFAULT_URL);

    // A local/unsynced drive: no switchboard resolves.
    installWindow("drive-local", { "drive-1": "http://remote:4001/graphql/r" });
    runtimeUrl.syncRuntimeUrl();

    expect(await requestUrl()).toBe(DEFAULT_URL);
  });

  it("does nothing outside the browser", async () => {
    installWindow("drive-1", { "drive-1": "http://remote:4001/graphql/r" });
    runtimeUrl.syncRuntimeUrl();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", server.fetch);

    runtimeUrl.syncRuntimeUrl();

    expect(await requestUrl()).toBe(
      "http://remote:4001/graphql/workflow-runtime",
    );
  });
});
