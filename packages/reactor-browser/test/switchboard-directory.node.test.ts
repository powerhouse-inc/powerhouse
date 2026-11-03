import {
  DriveCollectionId,
  type ISyncManager,
  type Remote,
} from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import type {
  SwitchboardDirectory,
  SwitchboardEntry,
} from "../src/types/switchboards.js";
import {
  createSwitchboardDirectory,
  resolveSwitchboard,
  SwitchboardLookupError,
  type SwitchboardRouter,
} from "../src/utils/switchboard-directory.js";

function syncRemote(driveId: string, url: string): Remote {
  return {
    meta: {
      id: `remote-${driveId}`,
      name: `remote-${driveId}`,
      collectionId: DriveCollectionId.forDrive(driveId),
      channelConfig: { type: "gql", parameters: { url } },
      filter: { documentId: [], scope: [], branch: "main" },
      options: {},
    },
    channel: {},
  } as unknown as Remote;
}

function syncManager(remotes: Remote[]): () => Pick<ISyncManager, "list"> {
  return () => ({ list: () => remotes });
}

// A router whose backends report `workflows` (undefined: facts unknown), and
// which places documents by the `placed` map.
function router(
  facts: Record<string, boolean | undefined>,
  placed: Record<string, string> = {},
): SwitchboardRouter {
  return {
    backends: Object.entries(facts).map(([name, workflows]) => ({
      name,
      facts: {
        known: workflows !== undefined,
        reactor: { workflows: workflows ?? false },
      },
    })),
    locate: (identifier) => {
      const name = placed[identifier];
      return name
        ? Promise.resolve(name)
        : Promise.reject(new Error(`no backend serves ${identifier}`));
    },
  };
}

async function lookupError(
  directory: SwitchboardDirectory | undefined,
  request?: Parameters<typeof resolveSwitchboard>[1],
): Promise<SwitchboardLookupError> {
  try {
    await resolveSwitchboard(directory, request);
  } catch (error) {
    if (error instanceof SwitchboardLookupError) return error;
    throw error;
  }
  throw new Error("resolved");
}

const SB = { name: "sb", url: "http://localhost:2540/d/sektar" };
const CLOUD = { name: "cloud", url: "https://cloud.example.com/api/d/sektar" };

describe("createSwitchboardDirectory", () => {
  it("lists a remote backend by its name, base and facts", () => {
    const directory = createSwitchboardDirectory({
      remoteBackends: [SB],
      router: router({ sb: true }),
    });
    expect(directory.list()).toEqual<SwitchboardEntry[]>([
      {
        name: "sb",
        base: "http://localhost:2540",
        graphqlUrl: "http://localhost:2540/graphql",
        via: "backend",
        workflows: true,
      },
    ]);
  });

  it("keeps a proxy prefix and resolves ${origin} against the page", () => {
    const directory = createSwitchboardDirectory({
      remoteBackends: [CLOUD, { name: "here", url: "${origin}/d/sektar" }],
      origin: "https://app.dev.sektar.be",
    });
    expect(directory.list().map((entry) => entry.base)).toEqual([
      "https://cloud.example.com/api",
      "https://app.dev.sektar.be",
    ]);
  });

  it("reports workflows as unknown when the facts could not be read", () => {
    const directory = createSwitchboardDirectory({
      remoteBackends: [SB],
      router: router({ sb: undefined }),
    });
    expect(directory.list()[0].workflows).toBe("unknown");
  });

  it("adds each synced drive's switchboard once, after the backends", () => {
    const directory = createSwitchboardDirectory({
      remoteBackends: [SB],
      syncManager: syncManager([
        syncRemote("a", "http://localhost:4001/graphql/r"),
        syncRemote("b", "http://localhost:4001/graphql/r"),
        // The backend's own switchboard is not listed twice.
        syncRemote("c", "http://localhost:2540/graphql/r"),
      ]),
    });
    expect(directory.list()).toEqual([
      expect.objectContaining({ name: "sb", via: "backend" }),
      {
        name: "localhost:4001",
        base: "http://localhost:4001",
        graphqlUrl: "http://localhost:4001/graphql",
        via: "sync",
        workflows: "unknown",
      },
    ]);
  });

  it("reads the sync manager on each call", () => {
    const remotes: Remote[] = [];
    const directory = createSwitchboardDirectory({
      syncManager: syncManager(remotes),
    });
    expect(directory.list()).toEqual([]);
    remotes.push(syncRemote("a", "http://remote:4001/graphql/r"));
    expect(directory.list().map((entry) => entry.name)).toEqual([
      "remote:4001",
    ]);
  });

  it("locates a document through the router, and a synced drive through its remote", async () => {
    const directory = createSwitchboardDirectory({
      remoteBackends: [SB, CLOUD],
      router: router({ sb: true, cloud: false }, { "doc-1": "cloud" }),
      syncManager: syncManager([
        syncRemote("drive-1", "http://localhost:4001/graphql/r"),
      ]),
    });
    expect((await directory.locate("doc-1"))?.name).toBe("cloud");
    expect((await directory.locate("drive-1"))?.name).toBe("localhost:4001");
    // Nothing places it: undefined, not an error.
    expect(await directory.locate("doc-2")).toBeUndefined();
  });

  it("places nothing on the tab's own backend", async () => {
    const directory = createSwitchboardDirectory({
      remoteBackends: [SB],
      router: router({ sb: true }, { "doc-1": "connect-local" }),
    });
    expect(await directory.locate("doc-1")).toBeUndefined();
  });
});

describe("resolveSwitchboard", () => {
  const one = createSwitchboardDirectory({
    remoteBackends: [SB],
    router: router({ sb: true }),
  });

  it("picks the only switchboard without being told", async () => {
    expect((await resolveSwitchboard(one)).name).toBe("sb");
    expect(
      (await resolveSwitchboard(one, { need: "workflows" })).graphqlUrl,
    ).toBe("http://localhost:2540/graphql");
  });

  it("uses a lone switchboard whose facts are unknown", async () => {
    const unknown = createSwitchboardDirectory({ remoteBackends: [SB] });
    expect(
      (await resolveSwitchboard(unknown, { need: "workflows" })).name,
    ).toBe("sb");
  });

  it("refuses a lone switchboard that runs no workflows", async () => {
    const off = createSwitchboardDirectory({
      remoteBackends: [SB],
      router: router({ sb: false }),
    });
    const error = await lookupError(off, { need: "workflows" });
    expect(error.code).toBe("NO_WORKFLOW_RUNTIME");
    expect(error.message).toContain("sb (http://localhost:2540)");
  });

  it("picks the one synced drive's switchboard", async () => {
    const synced = createSwitchboardDirectory({
      syncManager: syncManager([
        syncRemote("drive-1", "http://remote:4001/graphql/r"),
      ]),
    });
    expect((await resolveSwitchboard(synced, { need: "workflows" })).base).toBe(
      "http://remote:4001",
    );
  });

  it("takes a switchboard by name, or by any URL on it", async () => {
    const two = createSwitchboardDirectory({
      remoteBackends: [SB, CLOUD],
      router: router({ sb: true, cloud: true }),
    });
    expect((await resolveSwitchboard(two, { switchboard: "cloud" })).name).toBe(
      "cloud",
    );
    for (const url of [
      "https://cloud.example.com/api",
      "https://cloud.example.com/api/",
      "https://cloud.example.com/api/graphql/workflow-runtime",
    ]) {
      expect(
        (await resolveSwitchboard(two, { switchboard: url })).name,
        url,
      ).toBe("cloud");
    }
  });

  it("names the switchboards when the one asked for is unknown", async () => {
    const error = await lookupError(one, { switchboard: "elsewhere" });
    expect(error.code).toBe("UNKNOWN_SWITCHBOARD");
    expect(error.message).toBe(
      'No switchboard "elsewhere". This app reaches: sb (http://localhost:2540, runs workflows).',
    );
    expect(error.switchboards.map((entry) => entry.name)).toEqual(["sb"]);
  });

  it("refuses a named switchboard that runs no workflows", async () => {
    const two = createSwitchboardDirectory({
      remoteBackends: [SB, CLOUD],
      router: router({ sb: true, cloud: false }),
    });
    const error = await lookupError(two, {
      switchboard: "cloud",
      need: "workflows",
    });
    expect(error.code).toBe("NO_WORKFLOW_RUNTIME");
  });

  it("goes to the switchboard serving the document", async () => {
    const two = createSwitchboardDirectory({
      remoteBackends: [SB, CLOUD],
      router: router({ sb: true, cloud: true }, { "wf-1": "cloud" }),
    });
    expect(
      (await resolveSwitchboard(two, { documentId: "wf-1", need: "workflows" }))
        .name,
    ).toBe("cloud");
    // A name given wins over the document's switchboard.
    expect(
      (await resolveSwitchboard(two, { documentId: "wf-1", switchboard: "sb" }))
        .name,
    ).toBe("sb");
  });

  it("falls back to the only candidate when the document can't be placed", async () => {
    expect(
      (await resolveSwitchboard(one, { documentId: "local-doc" })).name,
    ).toBe("sb");
  });

  it("doesn't ask where a document is when there is one switchboard", async () => {
    let asked = 0;
    const lone: SwitchboardDirectory = {
      list: () => one.list(),
      locate: (documentId) => {
        asked++;
        return one.locate(documentId);
      },
    };
    expect((await resolveSwitchboard(lone, { documentId: "wf-1" })).name).toBe(
      "sb",
    );
    expect(asked).toBe(0);
  });

  it("falls back to the only workflow runtime when several can't place the document", async () => {
    const two = createSwitchboardDirectory({
      remoteBackends: [SB, CLOUD],
      router: router({ sb: false, cloud: true }),
    });
    expect(
      (
        await resolveSwitchboard(two, {
          documentId: "local",
          need: "workflows",
        })
      ).name,
    ).toBe("cloud");
  });

  it("picks the only switchboard running workflows among several", async () => {
    const two = createSwitchboardDirectory({
      remoteBackends: [SB, CLOUD],
      router: router({ sb: false, cloud: true }),
    });
    expect((await resolveSwitchboard(two, { need: "workflows" })).name).toBe(
      "cloud",
    );
  });

  it("picks the only one that may run workflows when the others don't", async () => {
    const two = createSwitchboardDirectory({
      remoteBackends: [SB, CLOUD],
      router: router({ sb: false, cloud: undefined }),
    });
    expect((await resolveSwitchboard(two, { need: "workflows" })).name).toBe(
      "cloud",
    );
  });

  it("refuses to guess between several that run workflows, and names them", async () => {
    const two = createSwitchboardDirectory({
      remoteBackends: [SB, CLOUD],
      router: router({ sb: true, cloud: true }),
    });
    const error = await lookupError(two, { need: "workflows" });
    expect(error.code).toBe("AMBIGUOUS_SWITCHBOARD");
    expect(error.message).toBe(
      'This app reaches several switchboards (sb (http://localhost:2540, runs workflows); cloud (https://cloud.example.com/api, runs workflows)); name one with "switchboard".',
    );
  });

  it("refuses to guess between several whose facts are unknown", async () => {
    const two = createSwitchboardDirectory({ remoteBackends: [SB, CLOUD] });
    expect((await lookupError(two, { need: "workflows" })).code).toBe(
      "AMBIGUOUS_SWITCHBOARD",
    );
  });

  it("says when none of several runs workflows", async () => {
    const two = createSwitchboardDirectory({
      remoteBackends: [SB, CLOUD],
      router: router({ sb: false, cloud: false }),
    });
    expect((await lookupError(two, { need: "workflows" })).code).toBe(
      "NO_WORKFLOW_RUNTIME",
    );
  });

  it("says when there is no switchboard, or no directory", async () => {
    const none = createSwitchboardDirectory({});
    expect((await lookupError(none)).code).toBe("NO_SWITCHBOARD");
    expect((await lookupError(undefined)).code).toBe("NO_DIRECTORY");
  });
});
