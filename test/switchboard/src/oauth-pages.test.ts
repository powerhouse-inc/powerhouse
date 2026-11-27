import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SWITCHBOARD_COMMAND } from "./switchboard-bin.js";

// The OAuth consent pages in a real browser (F3e part 2, the review of job B):
// headless Chromium opens a real switchboard's pages and presses their own
// buttons, as a person does. Renown is a stub on loopback, and so is the MCP
// client's redirect listener. A temporary data folder and identity home:
// never the person's.

const PORT = 4026;
const ORIGIN = `http://localhost:${PORT}`;
/** How long a button's navigation may take. */
const NAVIGATION = { timeout: 15_000 };

let root = "";
let proc: ChildProcess | undefined;
let logs = "";
let renown: Server;
let renownUrl = "";
let listener: Server;
let redirectUri = "";
/** What reached the MCP client's redirect listener. */
const returned: URL[] = [];
let browser: Browser;

/** A server on loopback, answered by `handle`; resolves to its origin. */
function listen(
  handle: Parameters<typeof createServer>[1],
): Promise<{ server: Server; origin: string }> {
  const server = createServer(handle);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" ? address?.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs: number,
  what: string,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${what} after ${timeoutMs}ms. Logs:\n${logs.slice(-8000)}`);
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "switchboard-oauth-pages-"));
  // Renown's console: every session it is asked about waits for a click.
  ({ server: renown, origin: renownUrl } = await listen((req, res) => {
    const pending = /^\/api\/console\/session\//.test(req.url ?? "");
    res.writeHead(pending ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(pending ? { status: "pending" } : {}));
  }));
  // The MCP client's loopback listener (RFC 8252 7.3).
  let callbackOrigin = "";
  ({ server: listener, origin: callbackOrigin } = await listen((req, res) => {
    returned.push(new URL(req.url ?? "/", callbackOrigin));
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>Back in the app</title>");
  }));
  redirectUri = `${callbackOrigin}/callback`;
  writeFileSync(
    join(root, "powerhouse.config.json"),
    JSON.stringify({ logLevel: "info" }),
  );
  proc = spawn(...SWITCHBOARD_COMMAND, {
    cwd: root,
    env: {
      ...process.env,
      PH_SWITCHBOARD_PORT: String(PORT),
      PH_USER_DATA_DIR: join(root, "store"),
      PH_IDENTITY_HOME: join(root, "switchboard-home"),
      PH_SUPERVISOR_HOME: join(root, "supervisor"),
      RENOWN_URL: renownUrl,
      AUTH_ENABLED: "false",
      BROWSER: "none",
      PORTLE_AUTOSTART: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  proc.stdout?.on("data", (chunk: Buffer) => (logs += chunk.toString()));
  proc.stderr?.on("data", (chunk: Buffer) => (logs += chunk.toString()));
  await waitFor(
    async () => (await fetch(`${ORIGIN}/ready`)).status === 200,
    120_000,
    "The switchboard was not ready",
  );
  browser = await chromium.launch({ headless: true });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  const running = proc;
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
  await new Promise<void>((resolve) => renown.close(() => resolve()));
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
}, 30_000);

/** A page of its own context: no cookies or cache shared between tests. */
async function withPage(run: (page: Page) => Promise<void>) {
  const context = await browser.newContext();
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

type Started = {
  device_code: string;
  user_code: string;
  verification_uri_complete: string;
};

async function startDeviceGrant(label: string): Promise<Started> {
  const response = await fetch(`${ORIGIN}/oauth/device_authorization`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "browser-e2e",
      ph_label: label,
      ph_days: "7",
    }).toString(),
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as Started;
}

async function pendingOf(userCode: string) {
  const response = await fetch(
    `${ORIGIN}/oauth/device/pending?user_code=${userCode}`,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { status: string; session_did: string };
}

describe("the device grant's consent page in a browser", () => {
  it("denies the grant with its own Deny button", async () => {
    const started = await startDeviceGrant("denied in a browser");
    await withPage(async (page) => {
      await page.goto(started.verification_uri_complete);
      expect(await page.locator("h1").textContent()).toBe(
        `Approve ${started.user_code}?`,
      );
      await page.getByRole("button", { name: "Deny" }).click();
      await page.waitForURL(`${ORIGIN}/oauth/device/deny`, NAVIGATION);
      expect(await page.locator("h1").textContent()).toBe("Denied");
    });
    expect((await pendingOf(started.user_code)).status).toBe("denied");
  }, 60_000);

  it("sends a Renown login to Renown's console with its own button", async () => {
    const started = await startDeviceGrant("renown in a browser");
    const { session_did } = await pendingOf(started.user_code);
    await withPage(async (page) => {
      await page.goto(started.verification_uri_complete);
      await page.getByRole("button", { name: "Approve with Renown" }).click();
      // The 303 lands on the console, for the grant's session key.
      await page.waitForURL(
        (url) => url.href.startsWith(`${renownUrl}/console`),
        NAVIGATION,
      );
      const params = Object.fromEntries(new URL(page.url()).searchParams);
      expect(params).toMatchObject({
        connect: session_did,
        app: "renown in a browser",
        host: ORIGIN,
        expiresInDays: "7",
      });
    });
    expect((await pendingOf(started.user_code)).status).toBe("pending");
  }, 60_000);
});

describe("the code grant's consent page in a browser", () => {
  it("sends a Deny back to the client's loopback redirect URI, with the state and the issuer", async () => {
    const registered = await fetch(`${ORIGIN}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "browser e2e",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
      }),
    });
    expect(registered.status, await registered.clone().text()).toBe(201);
    const { client_id } = (await registered.json()) as { client_id: string };
    const authorize = new URL(`${ORIGIN}/oauth/authorize`);
    for (const [name, value] of Object.entries({
      response_type: "code",
      client_id,
      redirect_uri: redirectUri,
      code_challenge: createHash("sha256")
        .update(randomBytes(32).toString("base64url"))
        .digest("base64url"),
      code_challenge_method: "S256",
      state: "browser-state",
      scope: "documents:write",
      resource: `${ORIGIN}/mcp`,
    })) {
      authorize.searchParams.set(name, value);
    }
    await withPage(async (page) => {
      await page.goto(authorize.href);
      expect(await page.locator("h1").textContent()).toMatch(
        /^Approve [A-Z]{4}-[A-Z]{4}\?$/,
      );
      await page.getByRole("button", { name: "Deny" }).click();
      await page.waitForURL(
        (url) => url.href.startsWith(redirectUri),
        NAVIGATION,
      );
    });
    expect(returned).toHaveLength(1);
    expect(Object.fromEntries(returned[0]!.searchParams)).toMatchObject({
      error: "access_denied",
      state: "browser-state",
      iss: ORIGIN,
    });
  }, 60_000);
});
