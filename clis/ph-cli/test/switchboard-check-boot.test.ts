import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkBoot, hostSchema } from "../src/runners/switchboard.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function projectRoot(config: unknown = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-check-boot-"));
  temporary.push(dir);
  writeFileSync(
    path.join(dir, "powerhouse.config.json"),
    JSON.stringify(config),
  );
  return dir;
}

const POSTGRES = "postgres://u:p@localhost:5432/reactor";

function host(extra: Record<string, unknown> = {}) {
  return hostSchema.parse({
    name: "lab-switchboard",
    runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
    ...extra,
  });
}

async function issuesOf(
  h: ReturnType<typeof host>,
  env: Record<string, string | undefined>,
  options: { verb?: string; root?: string } = {},
): Promise<string[]> {
  const issues = await checkBoot(h, {
    projectRoot: options.root ?? projectRoot(),
    verb: options.verb ?? "run",
    env,
    file: "hosts/switchboard/host.js",
  });
  return issues.map((i) => i.message);
}

describe("switchboard runner checkBoot", () => {
  it("reports nothing for a plain host", async () => {
    expect(await issuesOf(host(), {})).toEqual([]);
  });

  it("refuses workers on PGlite", async () => {
    expect(await issuesOf(host(), { REACTOR_WORKERS: "2" })).toEqual([
      expect.stringMatching(/REACTOR_WORKERS\) requires a Postgres reactor/),
    ]);
  });

  it("takes the reactor database from the host's storage", async () => {
    const postgres = host({
      reactor: {
        backends: {
          main: {
            kind: "in-process",
            storage: { kind: "postgres", url: POSTGRES },
          },
        },
      },
    });
    expect(await issuesOf(postgres, { REACTOR_WORKERS: "2" })).toEqual([]);
  });

  it("refuses workers under auth enforcement with a self Renown source", async () => {
    const env = {
      REACTOR_WORKERS: "2",
      REACTOR_AUTH_ENFORCEMENT: "true",
      RENOWN_SOURCE: "self",
      PH_REACTOR_DATABASE_URL: POSTGRES,
    };
    expect(await issuesOf(host(), env)).toEqual([
      expect.stringMatching(/cannot verify signers/),
    ]);
  });

  it("reads the Renown source from powerhouse.config.json", async () => {
    const root = projectRoot({ auth: { renown: { source: "self" } } });
    const env = {
      REACTOR_WORKERS: "2",
      REACTOR_AUTH_ENFORCEMENT: "true",
      PH_REACTOR_DATABASE_URL: POSTGRES,
    };
    expect(await issuesOf(host(), env, { root })).toEqual([
      expect.stringMatching(/cannot verify signers/),
    ]);
  });

  it("refuses workers in dev mode, by verb or runner.dev", async () => {
    const env = { REACTOR_WORKERS: "1", PH_REACTOR_DATABASE_URL: POSTGRES };
    const dev = [expect.stringMatching(/not supported in dev mode/)];
    expect(await issuesOf(host(), env, { verb: "dev" })).toEqual(dev);
    expect(
      await issuesOf(
        host({
          runner: {
            module: "@powerhousedao/ph-cli/runners/switchboard",
            dev: true,
          },
        }),
        env,
      ),
    ).toEqual(dev);
  });

  it("reports an env that contradicts the protocol block", async () => {
    const protocolHost = host({
      reactor: { protocol: { featureFlags: { authEnforcement: true } } },
    });
    const issues = await checkBoot(protocolHost, {
      projectRoot: projectRoot(),
      verb: "run",
      env: { REACTOR_AUTH_ENFORCEMENT: "false" },
      file: "hosts/switchboard/host.js",
    });
    expect(issues).toEqual([
      {
        path: "reactor.protocol",
        message: expect.stringMatching(
          /REACTOR_AUTH_ENFORCEMENT is "false" in the environment but "true" in hosts\/switchboard\/host\.js/,
        ) as string,
      },
    ]);
  });

  it("turns an env parse error into an issue", async () => {
    expect(
      await issuesOf(host(), { REACTOR_PROJECTION_WORKER: "maybe" }),
    ).toEqual([expect.stringMatching(/REACTOR_PROJECTION_WORKER must be one/)]);
  });
});
