import { describe, expect, it } from "vitest";
import {
  assertProtocolConsistency,
  primaryBackend,
  projectReactorToConnect,
  reactorBlockToSwitchboardConfig,
  reactorClientMode,
  protocolConflicts,
  protocolEnv,
  type ReactorConfig,
} from "../src/reactor-config.js";

const fullProtocol = {
  featureFlags: {
    documentDecisions: true,
    authEnforcement: true,
    authGroups: false,
    authConditions: false,
  },
  createSignaturePolicy: "legacy" as const,
  unsupportedStoredDocuments: "read-only" as const,
};

describe("primaryBackend", () => {
  it("prefers placement.primary, then main/local, then first", () => {
    expect(
      primaryBackend({
        backends: { a: { kind: "remote" }, main: { kind: "in-process" } },
      })?.kind,
    ).toBe("in-process");
    expect(
      primaryBackend({
        backends: { a: { kind: "remote" }, b: { kind: "worker" } },
        placement: { primary: "b" },
      })?.kind,
    ).toBe("worker");
    expect(
      primaryBackend({ backends: { only: { kind: "remote" } } })?.kind,
    ).toBe("remote");
    expect(primaryBackend(undefined)).toBeUndefined();
  });
});

describe("protocolEnv", () => {
  it("maps only the keys the block sets, booleans as true/false strings", () => {
    expect(protocolEnv(fullProtocol)).toEqual({
      REACTOR_DOCUMENT_DECISIONS: "true",
      REACTOR_AUTH_ENFORCEMENT: "true",
      REACTOR_AUTH_GROUPS: "false",
      REACTOR_AUTH_CONDITIONS: "false",
      CREATE_SIGNATURE_POLICY: "legacy",
      REACTOR_UNSUPPORTED_STORED_DOCUMENTS: "read-only",
    });
    expect(protocolEnv(undefined)).toEqual({});
    expect(protocolEnv({ featureFlags: { documentDecisions: true } })).toEqual({
      REACTOR_DOCUMENT_DECISIONS: "true",
    });
  });

  it("maps undoV3 onto REACTOR_UNDO_V3", () => {
    expect(protocolEnv({ featureFlags: { undoV3: false } })).toEqual({
      REACTOR_UNDO_V3: "false",
    });
    expect(protocolEnv({ featureFlags: { undoV3: true } })).toEqual({
      REACTOR_UNDO_V3: "true",
    });
  });
});

describe("reactorBlockToSwitchboardConfig", () => {
  it("maps protocol, storage, readModel, dynamic packages, workflows", () => {
    const reactor: ReactorConfig = {
      backends: {
        main: {
          kind: "in-process",
          storage: { kind: "path", dataDir: "/data/pglite" },
          readModel: { url: "dev.db" },
          packages: { dynamic: true },
        },
      },
      workflows: true,
      protocol: fullProtocol,
    };
    expect(reactorBlockToSwitchboardConfig(reactor)).toEqual({
      storage: {
        reactor: { url: "/data/pglite" },
        readModel: { url: "dev.db" },
      },
      protocol: fullProtocol,
      packages: { dynamic: true },
      features: { workflows: true },
    });
  });

  it("keeps the read model out of the reactor store", () => {
    expect(
      reactorBlockToSwitchboardConfig({
        backends: {
          main: { kind: "in-process", readModel: { url: "/data/read" } },
        },
      }),
    ).toEqual({ storage: { readModel: { url: "/data/read" } } });
  });

  it("uses the postgres url for a postgres backend", () => {
    const layer = reactorBlockToSwitchboardConfig({
      backends: {
        main: {
          kind: "in-process",
          storage: { kind: "postgres", url: "postgres://x" },
          readModel: { url: "" },
        },
      },
    });
    expect(layer.storage).toEqual({ reactor: { url: "postgres://x" } });
  });

  it("emits nothing for an empty reactor block", () => {
    expect(reactorBlockToSwitchboardConfig(undefined)).toEqual({});
  });
});

describe("projectReactorToConnect", () => {
  it("maps protocol → connect.reactor, worker kind, workflows", () => {
    const { connect } = projectReactorToConnect({
      backends: { local: { kind: "worker" } },
      workflows: true,
      protocol: fullProtocol,
    });
    expect(connect.reactor).toEqual(fullProtocol);
    expect(connect.instance).toEqual({
      reactorWorker: true,
      reactorClient: "worker",
    });
    expect(connect.app).toEqual({ workflowsEnabled: true });
  });

  it("reactorWorker false for in-process", () => {
    const { connect } = projectReactorToConnect({
      backends: { local: { kind: "in-process" } },
    });
    expect(connect.instance).toEqual({
      reactorWorker: false,
      reactorClient: "in-process",
    });
  });

  it("a lone remote backend → reactorClient remote (no local, no PGlite)", () => {
    const { connect } = projectReactorToConnect({
      backends: { sb: { kind: "remote", remote: { url: "http://x/graphql" } } },
    });
    expect(connect.instance?.reactorClient).toBe("remote");
    // remote kind !== worker, so legacy reactorWorker stays false
    expect(connect.instance?.reactorWorker).toBe(false);
  });

  it("local + remote backends → reactorClient router", () => {
    const { connect } = projectReactorToConnect({
      backends: {
        local: { kind: "worker" },
        sb: { kind: "remote", remote: { url: "http://x/graphql" } },
      },
      placement: { primary: "local" },
    });
    expect(connect.instance?.reactorClient).toBe("router");
  });

  it("no declared backends → no reactorClient (legacy fallback preserved)", () => {
    const { connect } = projectReactorToConnect({ protocol: fullProtocol });
    expect(connect.instance).toBeUndefined();
  });
});

describe("reactorClientMode", () => {
  it("returns undefined without backends", () => {
    expect(reactorClientMode({})).toBeUndefined();
    expect(reactorClientMode(undefined)).toBeUndefined();
  });
  it("classifies each topology", () => {
    expect(reactorClientMode({ backends: { m: { kind: "in-process" } } })).toBe(
      "in-process",
    );
    expect(reactorClientMode({ backends: { m: { kind: "worker" } } })).toBe(
      "worker",
    );
    expect(
      reactorClientMode({
        backends: { sb: { kind: "remote", remote: { url: "http://x" } } },
      }),
    ).toBe("remote");
    expect(
      reactorClientMode({
        backends: {
          m: { kind: "worker" },
          sb: { kind: "remote", remote: { url: "http://x" } },
        },
      }),
    ).toBe("router");
  });
});

describe("assertProtocolConsistency (the enforcement teeth)", () => {
  it("passes when env is unset or matches", () => {
    expect(() => assertProtocolConsistency(fullProtocol, {})).not.toThrow();
    expect(() =>
      assertProtocolConsistency(fullProtocol, {
        REACTOR_DOCUMENT_DECISIONS: "true",
        CREATE_SIGNATURE_POLICY: "legacy",
      }),
    ).not.toThrow();
  });

  it("throws naming the var and both values on contradiction", () => {
    expect(() =>
      assertProtocolConsistency(fullProtocol, {
        REACTOR_AUTH_ENFORCEMENT: "false",
      }),
    ).toThrow(/REACTOR_AUTH_ENFORCEMENT is "false".*but "true"/s);
    expect(() =>
      assertProtocolConsistency(fullProtocol, {
        CREATE_SIGNATURE_POLICY: "v2-required",
      }),
    ).toThrow(/CREATE_SIGNATURE_POLICY/);
  });
});

describe("protocolConflicts", () => {
  it("reads REACTOR_UNDO_V3 as the switchboard does: on unless exactly false", () => {
    const on = { featureFlags: { undoV3: true } };
    const off = { featureFlags: { undoV3: false } };
    expect(protocolConflicts(on, { REACTOR_UNDO_V3: "true" })).toEqual([]);
    expect(protocolConflicts(on, { REACTOR_UNDO_V3: "1" })).toEqual([]);
    expect(protocolConflicts(off, { REACTOR_UNDO_V3: "false" })).toEqual([]);
    expect(protocolConflicts(on, { REACTOR_UNDO_V3: "false" })).toHaveLength(1);
    expect(protocolConflicts(off, { REACTOR_UNDO_V3: "true" })).toHaveLength(1);
    expect(protocolConflicts(off, { REACTOR_UNDO_V3: "0" })).toHaveLength(1);
  });

  it("is empty without a protocol, an env, or a contradiction", () => {
    expect(protocolConflicts(undefined, { REACTOR_AUTH_GROUPS: "x" })).toEqual(
      [],
    );
    expect(protocolConflicts(fullProtocol, {})).toEqual([]);
    expect(
      protocolConflicts(fullProtocol, { REACTOR_DOCUMENT_DECISIONS: "true" }),
    ).toEqual([]);
  });

  it("reports every contradicting var, naming the host file", () => {
    const conflicts = protocolConflicts(
      fullProtocol,
      {
        REACTOR_AUTH_ENFORCEMENT: "false",
        REACTOR_UNSUPPORTED_STORED_DOCUMENTS: "refuse",
      },
      "hosts/sb/host.js",
    );
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0]).toMatch(
      /REACTOR_AUTH_ENFORCEMENT is "false" in the environment but "true" in hosts\/sb\/host\.js/,
    );
    expect(conflicts[1]).toMatch(/REACTOR_UNSUPPORTED_STORED_DOCUMENTS/);
  });
});
