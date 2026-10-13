import { describe, expect, it } from "vitest";
import {
  assertProtocolConsistency,
  primaryBackend,
  projectReactorToConnect,
  projectReactorToSwitchboard,
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
});

describe("projectReactorToSwitchboard", () => {
  it("projects protocol, storage, readModel, dynamic packages, workflows", () => {
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
    const { env, options } = projectReactorToSwitchboard(reactor);
    expect(env).toMatchObject({
      REACTOR_DOCUMENT_DECISIONS: "true",
      CREATE_SIGNATURE_POLICY: "legacy",
      PH_REACTOR_DATABASE_URL: "/data/pglite",
      DYNAMIC_MODEL_LOADING: "true",
      PH_WORKFLOWS_ENABLED: "1",
    });
    expect(options.dbPath).toBe("dev.db");
  });

  it("uses the postgres url for a postgres backend", () => {
    const { env } = projectReactorToSwitchboard({
      backends: {
        main: { storage: { kind: "postgres", url: "postgres://x" } },
      },
    });
    expect(env.PH_REACTOR_DATABASE_URL).toBe("postgres://x");
  });

  it("emits nothing for an empty reactor block", () => {
    expect(projectReactorToSwitchboard(undefined)).toEqual({
      env: {},
      options: {},
    });
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
    expect(connect.instance).toEqual({ reactorWorker: true });
    expect(connect.app).toEqual({ workflowsEnabled: true });
  });

  it("reactorWorker false for in-process", () => {
    const { connect } = projectReactorToConnect({
      backends: { local: { kind: "in-process" } },
    });
    expect(connect.instance).toEqual({ reactorWorker: false });
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
