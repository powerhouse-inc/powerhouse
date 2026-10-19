import { describe, expect, it } from "vitest";
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import {
  backendsToDescriptors,
  backendToDescriptor,
  isStructuralMultiReactor,
  remoteBackendUrls,
  type ProjectedDescriptor,
} from "../src/backend-projection.js";

describe("backendToDescriptor (P4.1)", () => {
  it("projects kind/storage/packages and rides the protocol featureFlags", () => {
    const d = backendToDescriptor(
      "local",
      {
        kind: "worker",
        storage: { kind: "idb" },
        packages: { dynamic: true },
      },
      { featureFlags: { documentDecisions: true } },
    );
    expect(d).toEqual({
      kind: "worker",
      name: "local",
      storage: { kind: "idb" },
      packages: { dynamic: true },
      featureFlags: { documentDecisions: true },
    });
  });

  it("rides undoV3:false onto the descriptor", () => {
    expect(
      backendToDescriptor("local", {}, { featureFlags: { undoV3: false } })
        .featureFlags,
    ).toEqual({ undoV3: false });
  });

  it("defaults kind to in-process", () => {
    expect(backendToDescriptor("x", {}).kind).toBe("in-process");
  });

  it("maps path storage with required dataDir; refuses postgres on a provisioned backend", () => {
    expect(
      backendToDescriptor("x", {
        kind: "in-process",
        storage: { kind: "path", dataDir: "./.ph/data" },
      }).storage,
    ).toEqual({ kind: "path", dataDir: "./.ph/data" });
    expect(() =>
      backendToDescriptor("x", {
        kind: "in-process",
        storage: { kind: "path" },
      }),
    ).toThrow(/requires dataDir/);
    expect(() =>
      backendToDescriptor("x", {
        kind: "worker",
        storage: { kind: "postgres", url: "postgres://db" },
      }),
    ).toThrow(/server-side only/);
  });

  it("requires remote.url on a remote backend", () => {
    expect(() => backendToDescriptor("sb", { kind: "remote" })).toThrow(
      /remote\.url/,
    );
    expect(
      backendToDescriptor("sb", {
        kind: "remote",
        remote: { url: "http://localhost:7064/d/x" },
      }).remote,
    ).toEqual({ url: "http://localhost:7064/d/x" });
  });

  it("the projection output IS a reactor-monitor ReactorDescriptor (type pin)", () => {
    // Compile-time assignability: an upstream field rename breaks this file.
    const projected: ProjectedDescriptor = backendToDescriptor("local", {
      kind: "in-process",
      storage: { kind: "memory" },
    });
    const descriptor: ReactorDescriptor = projected;
    expect(descriptor.name).toBe("local");
  });
});

describe("backendsToDescriptors ordering", () => {
  it("places placement.primary first", () => {
    const names = backendsToDescriptors({
      backends: {
        a: { kind: "remote", remote: { url: "http://x" } },
        b: { kind: "worker" },
      },
      placement: { primary: "b" },
    }).map((d) => d.name);
    expect(names).toEqual(["b", "a"]);
  });

  it("empty for no backends", () => {
    expect(backendsToDescriptors(undefined)).toEqual([]);
  });
});

describe("structural multi-reactor (P4.2 inputs)", () => {
  const twoBackends = {
    backends: {
      local: { kind: "worker" as const },
      main: {
        kind: "remote" as const,
        remote: { url: "http://localhost:7064/d/drive" },
      },
    },
  };

  it("true for local + remote; false for single or remote-only", () => {
    expect(isStructuralMultiReactor(twoBackends)).toBe(true);
    expect(
      isStructuralMultiReactor({ backends: { local: { kind: "worker" } } }),
    ).toBe(false);
    expect(
      isStructuralMultiReactor({
        backends: { sb: { kind: "remote", remote: { url: "http://x" } } },
      }),
    ).toBe(false);
    expect(isStructuralMultiReactor(undefined)).toBe(false);
  });

  it("remoteBackendUrls lists the dialable urls", () => {
    expect(remoteBackendUrls(twoBackends)).toEqual([
      "http://localhost:7064/d/drive",
    ]);
  });
});
