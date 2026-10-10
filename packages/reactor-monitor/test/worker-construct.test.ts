import { ChannelScheme } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import {
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
