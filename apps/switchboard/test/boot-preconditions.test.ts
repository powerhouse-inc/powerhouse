import { describe, expect, it } from "vitest";
import {
  reactorDbUrlOf,
  switchboardBootFactsFromEnv,
  switchboardBootFactsOf,
  switchboardBootIssues,
  type SwitchboardBootFacts,
} from "../src/boot.mjs";

const POSTGRES = "postgres://u:p@localhost:5432/reactor";

const clean: SwitchboardBootFacts = {
  dev: false,
  workers: 0,
  projectionWorker: false,
  reactorDbUrl: undefined,
  authEnforcement: false,
  renownSource: "remote",
};

describe("switchboardBootIssues", () => {
  it("reports nothing with the pools off", () => {
    expect(switchboardBootIssues({ ...clean, dev: true })).toEqual([]);
  });

  it("reports nothing for workers on Postgres", () => {
    expect(
      switchboardBootIssues({ ...clean, workers: 2, reactorDbUrl: POSTGRES }),
    ).toEqual([]);
  });

  it("reports every worker-pool issue, in the server's order", () => {
    const issues = switchboardBootIssues({
      ...clean,
      dev: true,
      workers: 2,
      authEnforcement: true,
      renownSource: "self",
    });
    expect(issues).toHaveLength(3);
    expect(issues[0]).toMatch(/REACTOR_WORKERS\) is not supported in dev mode/);
    expect(issues[1]).toMatch(/cannot verify signers/);
    expect(issues[2]).toMatch(
      /REACTOR_WORKERS\) requires a Postgres reactor database/,
    );
  });

  it("treats a PGlite path as no Postgres", () => {
    expect(
      switchboardBootIssues({
        ...clean,
        workers: 1,
        reactorDbUrl: "./.ph/reactor-storage",
      }),
    ).toEqual([expect.stringMatching(/requires a Postgres reactor database/)]);
  });

  it("reports the projection worker's issues when it is enabled", () => {
    expect(
      switchboardBootIssues({ ...clean, dev: true, projectionWorker: true }),
    ).toEqual([
      expect.stringMatching(/REACTOR_PROJECTION_WORKER\) is not supported/),
      expect.stringMatching(
        /REACTOR_PROJECTION_WORKER\) requires a Postgres reactor database/,
      ),
    ]);
  });
});

describe("switchboardBootFactsOf", () => {
  it("reads the facts from a config", async () => {
    expect(
      await switchboardBootFactsOf(
        {
          storage: {
            reactor: { url: POSTGRES },
            readModel: { url: "./read" },
          },
          workers: { executor: { count: 3 }, projection: { enabled: true } },
          protocol: { featureFlags: { authEnforcement: true } },
          auth: { renown: { source: "self" } },
        },
        { dev: false },
      ),
    ).toEqual({
      dev: false,
      workers: 3,
      projectionWorker: true,
      reactorDbUrl: POSTGRES,
      authEnforcement: true,
      renownSource: "self",
    });
  });

  it("never takes the reactor database from the read model", async () => {
    const facts = await switchboardBootFactsOf(
      { storage: { readModel: { url: POSTGRES } } },
      { dev: false },
    );
    expect(facts.reactorDbUrl).toBeUndefined();
  });

  it("lets the config's renown source win over the configured one", async () => {
    const configuredRenown = { source: "self" as const };
    expect(
      (await switchboardBootFactsOf({}, { dev: false, configuredRenown }))
        .renownSource,
    ).toBe("self");
    expect(
      (
        await switchboardBootFactsOf(
          { auth: { renown: { source: "remote" } } },
          { dev: false, configuredRenown },
        )
      ).renownSource,
    ).toBe("remote");
  });
});

describe("switchboardBootFactsFromEnv", () => {
  it("reads the facts with the server's parsers", async () => {
    const { facts, issues } = await switchboardBootFactsFromEnv(
      {
        REACTOR_WORKERS: "3",
        REACTOR_PROJECTION_WORKER: "on",
        REACTOR_AUTH_ENFORCEMENT: "true",
        RENOWN_SOURCE: "self",
        PH_SWITCHBOARD_DATABASE_URL: POSTGRES,
      },
      { dev: false },
    );
    expect(issues).toEqual([]);
    expect(facts).toEqual({
      dev: false,
      workers: 3,
      projectionWorker: true,
      reactorDbUrl: POSTGRES,
      authEnforcement: true,
      renownSource: "self",
    });
  });

  it("prefers dbPath, then PH_REACTOR_DATABASE_URL", async () => {
    const env = {
      PH_REACTOR_DATABASE_URL: "./reactor",
      PH_SWITCHBOARD_DATABASE_URL: POSTGRES,
    };
    expect(
      (await switchboardBootFactsFromEnv(env, { dev: false })).facts
        .reactorDbUrl,
    ).toBe("./reactor");
    expect(
      (await switchboardBootFactsFromEnv(env, { dev: false, dbPath: POSTGRES }))
        .facts.reactorDbUrl,
    ).toBe(POSTGRES);
  });

  it("lets RENOWN_SOURCE win over the configured source", async () => {
    const configuredRenown = { source: "self" as const };
    expect(
      (await switchboardBootFactsFromEnv({}, { dev: false, configuredRenown }))
        .facts.renownSource,
    ).toBe("self");
    expect(
      (
        await switchboardBootFactsFromEnv(
          { RENOWN_SOURCE: "remote" },
          { dev: false, configuredRenown },
        )
      ).facts.renownSource,
    ).toBe("remote");
  });

  it("turns parser errors into issues", async () => {
    const { facts, issues } = await switchboardBootFactsFromEnv(
      { REACTOR_WORKERS: "lots", REACTOR_PROJECTION_WORKER: "maybe" },
      { dev: false },
    );
    expect(issues).toEqual([
      expect.stringMatching(/REACTOR_WORKERS/),
      expect.stringMatching(/REACTOR_PROJECTION_WORKER must be one of/),
    ]);
    expect(facts.workers).toBe(0);
    expect(facts.projectionWorker).toBe(false);
  });
});

describe("reactorDbUrlOf", () => {
  it("prefers dbPath, then PH_REACTOR_DATABASE_URL, then PH_SWITCHBOARD_DATABASE_URL", () => {
    const env = {
      PH_REACTOR_DATABASE_URL: "./r",
      PH_SWITCHBOARD_DATABASE_URL: POSTGRES,
    };
    expect(reactorDbUrlOf("./d", env)).toBe("./d");
    expect(reactorDbUrlOf(undefined, env)).toBe("./r");
    expect(
      reactorDbUrlOf(undefined, { PH_SWITCHBOARD_DATABASE_URL: POSTGRES }),
    ).toBe(POSTGRES);
  });
});
