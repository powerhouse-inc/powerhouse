import type { IReactorClient } from "@powerhousedao/reactor";
import { resolveFeatureFlags } from "@powerhousedao/reactor";
import {
  createPortTransport,
  ReactorHost,
} from "@powerhousedao/reactor-browser/rpc";
import type { IRenown } from "@renown/sdk";
import { describe, expect, it } from "vitest";
import {
  buildWorkerConstruct,
  buildWorkerVersion,
  type WorkerReactorClientArgs,
} from "../src/reactor-worker-client.js";

function args(
  overrides: Partial<WorkerReactorClientArgs> = {},
): WorkerReactorClientArgs {
  return {
    namespace: "ns",
    relationalNamespace: "rel",
    cdnUrl: "",
    packageSpecs: [],
    featureFlags: {},
    multiReactor: false,
    documentModelModules: [],
    upgradeManifests: [],
    documentModelLoader: { load: () => Promise.reject(new Error("unused")) },
    renown: {} as IRenown,
    onReload: () => undefined,
    ...overrides,
  };
}

function openTab(host: ReactorHost) {
  const channel = new MessageChannel();
  host.connect(createPortTransport(channel.port1));
  const port = channel.port2;
  const reloads: string[] = [];
  const pending = new Map<string, (value: unknown) => void>();
  let counter = 0;
  port.onmessage = (event: MessageEvent) => {
    const msg = event.data as {
      k: string;
      id?: string;
      value?: unknown;
      reason?: string;
    };
    if (msg.k === "res" && msg.id) pending.get(msg.id)?.(msg.value);
    if (msg.k === "reload") reloads.push(msg.reason ?? "");
  };
  const hello = (version: unknown) => {
    const id = `h${++counter}`;
    const reply = new Promise((resolve) => pending.set(id, resolve));
    port.postMessage({ k: "hello", id, version });
    return reply;
  };
  return { hello, reloads, close: () => port.close() };
}

describe("worker version fingerprint", () => {
  it("never carries the remote config, which stays in the tab", () => {
    const keys = [
      ...Object.keys(buildWorkerConstruct(args())),
      ...Object.keys(buildWorkerVersion(args())),
    ];
    for (const remote of ["remoteBackends", "collections", "defaultDrives"]) {
      expect(keys).not.toContain(remote);
    }
  });

  it("is unchanged by multiReactor off", () => {
    expect(buildWorkerVersion(args()).featureFlags).toBe("");
    expect(
      buildWorkerVersion(
        args({
          featureFlags: { documentDecisions: true, authEnforcement: true },
        }),
      ).featureFlags,
    ).toBe("authEnforcement,documentDecisions");
  });

  it("retires a running worker when a tab flips multiReactor", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve({} as IReactorClient),
    });
    const first = openTab(host);
    const second = openTab(host);
    try {
      await expect(
        first.hello(buildWorkerVersion(args({ multiReactor: false }))),
      ).resolves.toEqual({ ok: true });
      await expect(
        second.hello(buildWorkerVersion(args({ multiReactor: true }))),
      ).resolves.toEqual({ ok: false });
      expect(host.retired).toBe(true);
      expect(second.reloads[0]).toMatch(/flags changed/);
    } finally {
      first.close();
      second.close();
    }
  });

  // undoV3 has a default: a tab that turns it the other way retires the
  // worker, and one that spells the default out does not.
  const undoV3 = resolveFeatureFlags().undoV3;

  it("retires a running worker when a tab turns undoV3 from its default", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve({} as IReactorClient),
    });
    const first = openTab(host);
    const second = openTab(host);
    try {
      await expect(first.hello(buildWorkerVersion(args()))).resolves.toEqual({
        ok: true,
      });
      await expect(
        second.hello(
          buildWorkerVersion(args({ featureFlags: { undoV3: !undoV3 } })),
        ),
      ).resolves.toEqual({ ok: false });
      expect(host.retired).toBe(true);
      expect(second.reloads[0]).toMatch(/flags changed/);
    } finally {
      first.close();
      second.close();
    }
  });

  it("keeps a running worker when a tab sets undoV3 to its default", () => {
    expect(
      buildWorkerVersion(args({ featureFlags: { undoV3 } })).featureFlags,
    ).toBe(buildWorkerVersion(args()).featureFlags);
  });
});
