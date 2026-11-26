import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveActiveIdentity } from "@renown/sdk/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SWITCHBOARD_COMMAND } from "./switchboard-bin.js";

// Host sessions under the policies other than OPEN, each on a switchboard of
// its own (F3e part 2): with AUTH_ENABLED and no document permissions
// (ADMIN_ONLY) a session could do nothing, so none is granted, saying why;
// with document permissions a token is issued and, though its user is in
// ADMINS, administers nothing. Temporary data folders and identity homes.

const DEVICE_CODE = "urn:ietf:params:oauth:grant-type:device_code";

let stub: Server;
let stubUrl = "";

beforeAll(async () => {
  // Renown and the registry: never reached for anything that matters here.
  stub = createServer((_req, res) => {
    res.writeHead(404, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((resolve) =>
    stub.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = stub.address();
  stubUrl = `http://127.0.0.1:${typeof address === "object" ? address?.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => stub.close(() => resolve()));
});

/** A switchboard on `port` with `env`, administered by a fresh pseudonym. */
function host(port: number, env: Record<string, string>) {
  const origin = `http://localhost:${port}`;
  const state = {
    origin,
    root: "",
    logs: "",
    proc: undefined as ChildProcess | undefined,
    person: undefined as Awaited<ReturnType<typeof resolveActiveIdentity>>,
  };

  beforeAll(async () => {
    state.root = mkdtempSync(join(tmpdir(), "switchboard-host-policies-"));
    state.person = await resolveActiveIdentity({
      dataDir: join(state.root, "person"),
      interactive: false,
      create: true,
      env: { PH_IDENTITY_HOME: join(state.root, "home") },
    });
    writeFileSync(
      join(state.root, "powerhouse.config.json"),
      JSON.stringify({ logLevel: "info" }),
    );
    state.proc = spawn(...SWITCHBOARD_COMMAND, {
      cwd: state.root,
      env: {
        ...process.env,
        PH_SWITCHBOARD_PORT: String(port),
        PH_USER_DATA_DIR: join(state.root, "store"),
        PH_IDENTITY_HOME: join(state.root, "switchboard-home"),
        ADMINS: state.person!.address,
        RENOWN_URL: stubUrl,
        PH_REGISTRY_URL: stubUrl,
        BROWSER: "none",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    state.proc.stdout?.on("data", (chunk: Buffer) => {
      state.logs = (state.logs + chunk.toString()).slice(-65_536);
    });
    state.proc.stderr?.on("data", (chunk: Buffer) => {
      state.logs = (state.logs + chunk.toString()).slice(-65_536);
    });
    const start = Date.now();
    while (Date.now() - start < 120_000) {
      const ready = await fetch(`${origin}/ready`).catch(() => undefined);
      if (ready?.status === 200) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`The switchboard was not ready. Logs:\n${state.logs}`);
  }, 180_000);

  afterAll(async () => {
    const running = state.proc;
    if (running && running.exitCode === null) {
      await new Promise<void>((done) => {
        running.once("close", () => done());
        running.kill();
        setTimeout(() => {
          running.kill("SIGKILL");
          done();
        }, 10_000).unref();
      });
    }
    rmSync(state.root, { recursive: true, force: true });
  }, 30_000);

  return state;
}

function form(origin: string, path: string, fields: Record<string, string>) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("under ADMIN_ONLY (AUTH_ENABLED, no document permissions)", () => {
  const sb = host(4025, { AUTH_ENABLED: "true" });

  it("grants no host session, and says why", async () => {
    const response = await form(sb.origin, "/oauth/device_authorization", {
      client_id: "e2e",
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: string;
      error_description: string;
    };
    expect(body.error).toBe("invalid_scope");
    expect(body.error_description).toMatch(/ADMIN_ONLY/);
    expect(body.error_description).toMatch(/DOCUMENT_PERMISSIONS_ENABLED/);
  });
});

describe("with document permissions", () => {
  const sb = host(4026, {
    AUTH_ENABLED: "true",
    DOCUMENT_PERMISSIONS_ENABLED: "true",
  });

  it("issues a token that administers nothing, though its user is in ADMINS", async () => {
    const started = (await (
      await form(sb.origin, "/oauth/device_authorization", {
        client_id: "e2e",
        ph_label: "billing",
        ph_days: "7",
      })
    ).json()) as { device_code: string; user_code: string };
    const pending = (await (
      await fetch(
        `${sb.origin}/oauth/device/pending?user_code=${started.user_code}`,
      )
    ).json()) as { session_did: string; nonce: string };
    const credential = await sb.person!.issueSessionCredential!(
      pending.session_did,
      { label: "billing", expiresInDays: 7 },
    );
    const approved = await fetch(`${sb.origin}/oauth/device/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_code: started.user_code,
        credential,
        nonce: pending.nonce,
      }),
    });
    expect(approved.status, await approved.clone().text()).toBe(200);
    const issued = (await (
      await form(sb.origin, "/oauth/token", {
        grant_type: DEVICE_CODE,
        device_code: started.device_code,
        client_id: "e2e",
      })
    ).json()) as { access_token: string };
    expect(issued.access_token).toMatch(/^phs_/);

    const response = await fetch(`${sb.origin}/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${issued.access_token}`,
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          mutation {
            Packages {
              installPackage(name: "@powerhousedao/never-installed") {
                documentModelsLoaded
              }
            }
          }
        `,
      }),
    });
    const body = (await response.json()) as {
      errors?: { message: string }[];
    };
    expect(body.errors?.[0]?.message).toContain("Admin access required");
    expect(sb.logs).toContain("administrative call refused");
  }, 60_000);
});
