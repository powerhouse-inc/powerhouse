import {
  ChannelScheme,
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
} from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import {
  builtWorkerConfigOf,
  parseBuiltWorkerConfig,
  parseWorkerConstruct,
  toWorkerConstruct,
  type ReactorDescriptor,
} from "../src/index.js";

describe("toWorkerConstruct", () => {
  it("derives the store namespace from the descriptor name", () => {
    const construct = toWorkerConstruct({ kind: "worker", name: "alpha" });

    expect(construct).toEqual({
      name: "alpha",
      namespace: "reactor-monitor-alpha",
    });
  });

  it("carries only what survives postMessage", () => {
    const descriptor: ReactorDescriptor = {
      kind: "worker",
      name: "full",
      storage: { kind: "memory" },
      packages: {
        cdnUrl: "https://registry.test",
        specs: ["pkg@1.0.0"],
        sources: [{ name: "local", url: "https://local.test/models.js" }],
      },
      featureFlags: { authEnforcement: false },
      sync: { channelScheme: ChannelScheme.CONNECT },
      // Not cloneable; must not reach the construct.
      documentModelModules: [],
      signer: undefined,
      workerUrl: "https://example.test/worker.js",
    };

    const construct = toWorkerConstruct(descriptor);

    expect(construct).toEqual({
      name: "full",
      namespace: "reactor-monitor-full",
      storage: { kind: "memory" },
      cdnUrl: "https://registry.test",
      packageSpecs: ["pkg@1.0.0"],
      packageSources: [{ name: "local", url: "https://local.test/models.js" }],
      featureFlags: { authEnforcement: false },
      channelScheme: "connect",
    });
    expect(construct).not.toHaveProperty("documentModelModules");
    expect(construct).not.toHaveProperty("signer");
    expect(construct).not.toHaveProperty("workerUrl");
    expect(structuredClone(construct)).toEqual(construct);
  });

  it("round-trips through parseWorkerConstruct", () => {
    const construct = toWorkerConstruct({
      kind: "worker",
      name: "round-trip",
      storage: { kind: "path", dataDir: "/tmp/x" },
      sync: { channelScheme: null },
    });

    expect(parseWorkerConstruct(structuredClone(construct))).toEqual(construct);
  });
});

describe("parseWorkerConstruct", () => {
  it("fills the namespace in when a tab omitted it", () => {
    expect(parseWorkerConstruct({ name: "no-ns" })).toEqual({
      name: "no-ns",
      namespace: "reactor-monitor-no-ns",
    });
  });

  it("refuses a construct that is not an object", () => {
    for (const raw of [undefined, null, "alpha", 7]) {
      expect(() => parseWorkerConstruct(raw)).toThrow(
        /Invalid worker construct/,
      );
    }
  });

  it("refuses a missing or blank name", () => {
    expect(() => parseWorkerConstruct({})).toThrow(/name must be/);
    expect(() => parseWorkerConstruct({ name: "   " })).toThrow(/name must be/);
  });

  it("refuses malformed fields rather than building over them", () => {
    expect(() =>
      parseWorkerConstruct({ name: "a", packageSpecs: "pkg@1" }),
    ).toThrow(/packageSpecs must be string\[\]/);
    expect(() =>
      parseWorkerConstruct({ name: "a", packageSpecs: [1] }),
    ).toThrow(/packageSpecs must be string\[\]/);
    expect(() =>
      parseWorkerConstruct({ name: "a", packageSources: "x" }),
    ).toThrow(/packageSources must be an array/);
    expect(() =>
      parseWorkerConstruct({ name: "a", featureFlags: "all" }),
    ).toThrow(/featureFlags must be an object/);
    expect(() =>
      parseWorkerConstruct({ name: "a", storage: { kind: "s3" } }),
    ).toThrow(/storage must be/);
    expect(() =>
      parseWorkerConstruct({ name: "a", storage: { kind: "path" } }),
    ).toThrow(/storage must be/);
    expect(() =>
      parseWorkerConstruct({ name: "a", channelScheme: "carrier-pigeon" }),
    ).toThrow(/channelScheme must be/);
  });

  it("keeps an explicit null channelScheme distinct from an absent one", () => {
    expect(parseWorkerConstruct({ name: "a", channelScheme: null })).toEqual({
      name: "a",
      namespace: "reactor-monitor-a",
      channelScheme: null,
    });
    expect(parseWorkerConstruct({ name: "a" })).not.toHaveProperty(
      "channelScheme",
    );
  });
});

/**
 * The worker's built-config report: the two facts only the built reactor knows,
 * plus the store it was opened over. It crosses `postMessage` from a worker
 * that may be on a different build of this library, so the tab validates it
 * exactly as it validates a construct.
 */
describe("the built worker config report", () => {
  it("reports the routed channel types rather than the construct's sync request", () => {
    const report = builtWorkerConfigOf(
      {
        name: "reported",
        namespace: "reactor-monitor-reported",
        storage: { kind: "memory" },
        channelScheme: ChannelScheme.CONNECT,
      },
      true,
      [GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE],
    );

    expect(report).toEqual({
      storage: { kind: "memory" },
      syncChannelTypes: [GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE],
      canSelfHeal: true,
    });
    expect(report).not.toHaveProperty("channelScheme");
    expect(report).not.toHaveProperty("localSync");
    expect(structuredClone(report)).toEqual(report);
    expect(parseBuiltWorkerConfig(structuredClone(report))).toEqual(report);
  });

  // A worker on a build that predates the routing report answers without the
  // field. Reading that silence as "routes nothing" would hide a version skew
  // behind a plausible contract, so the payload is refused and the tab falls
  // back to its conservative no-local reading WITH a warning.
  it("refuses a report that does not name the channel types it routes", () => {
    expect(() =>
      parseBuiltWorkerConfig({
        storage: { kind: "memory" },
        canSelfHeal: true,
        channelScheme: "connect",
        localSync: false,
      }),
    ).toThrow(/syncChannelTypes must be string\[\]/);
    expect(() =>
      parseBuiltWorkerConfig({
        storage: { kind: "memory" },
        canSelfHeal: true,
        syncChannelTypes: [1],
      }),
    ).toThrow(/syncChannelTypes must be string\[\]/);
  });

  it("refuses a report with no self-heal fact and one that is not an object", () => {
    expect(() =>
      parseBuiltWorkerConfig({
        storage: { kind: "memory" },
        syncChannelTypes: [],
      }),
    ).toThrow(/canSelfHeal must be a boolean/);
    for (const raw of [undefined, null, "built", 7]) {
      expect(() => parseBuiltWorkerConfig(raw)).toThrow(
        /Invalid built worker config/,
      );
    }
  });
});
