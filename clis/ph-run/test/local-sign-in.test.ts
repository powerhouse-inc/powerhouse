import {
  mintSignInCode,
  newSignInSecret,
  type LocalSignInIssuer,
} from "@powerhousedao/shared/clis/local-sign-in";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runConnectServer } from "../src/services/connect-server.js";
import { localSignInStep } from "../src/services/local-sign-in.js";
import type { ConnectPreviewArgs } from "../src/services/service-args.js";

/**
 * The sign-in endpoint of a served Connect (F3d), through a real server: what
 * it lets through, and what the code allows. The issuer is a stand-in that
 * records what it was asked; renown's own tests cover the credentials.
 */

const SESSION = "did:key:zDnaePageSessionKeyForTheTestOnly0000000";
const secret = newSignInSecret();
const asked: { method: string; args: Record<string, unknown> }[] = [];
let lockedUntilPassword = false;

const issued = (sessionDid: string) => ({
  ok: true as const,
  credential: { credentialSubject: { id: sessionDid, app: "connect" } },
  identity: {
    kind: "pseudonym" as const,
    address: "0xabc",
    label: "Anonymous 0xabc",
  },
  expiresAt: "2026-12-24T00:00:00.000Z",
  renewFrom: "2026-12-17T00:00:00.000Z",
  sessions: [],
});

const issuer: LocalSignInIssuer = {
  signIn: (args) => {
    asked.push({ method: "signIn", args });
    if (lockedUntilPassword && args.password === undefined) {
      return Promise.resolve({
        ok: false,
        status: 423,
        reason: "password-required",
      } as const);
    }
    if (lockedUntilPassword && args.password !== "pw") {
      return Promise.resolve({
        ok: false,
        status: 401,
        reason: "wrong-password",
      } as const);
    }
    return Promise.resolve(issued(args.sessionDid));
  },
  renew: (args) => {
    asked.push({ method: "renew", args });
    return Promise.resolve(issued(SESSION));
  },
  unlock: (args) => {
    asked.push({ method: "unlock", args });
    return Promise.resolve({
      ok: true as const,
      sessions: [{ label: "agent", expiresAt: "x" }],
    });
  },
  renewSessions: () => Promise.resolve([]),
};

let dist: string;
let port: number;
let close: () => Promise<void>;

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "ph-local-sign-in-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(join(dist, "powerhouse.config.json"), "{}");
  const server = await runConnectServer(
    {
      outDir: dist,
      port: 0,
      host: "127.0.0.1",
      strictPort: true,
    } as ConnectPreviewArgs,
    undefined,
    dist,
    { localSignIn: { secret, issuer: () => Promise.resolve(issuer) } },
  );
  port = Number(new URL(server.resolvedUrls.local[0]!).port);
  close = () => server.close();
});

afterAll(async () => {
  await close();
  rmSync(dist, { recursive: true, force: true });
});

beforeEach(() => {
  asked.length = 0;
  lockedUntilPassword = false;
});

type Answer = {
  status: number;
  headers: IncomingMessage["headers"];
  body: Record<string, unknown>;
};

/** A request to this server, with the headers given as they are. */
function send(
  method: string,
  route: string,
  o: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<Answer> {
  const host = `localhost:${port}`;
  const headers: Record<string, string> = {
    host,
    ...(method === "POST"
      ? { origin: `http://${host}`, "content-type": "application/json" }
      : {}),
    ...o.headers,
  };
  return new Promise((done, fail) => {
    const req = request(
      { host: "127.0.0.1", port, method, path: route, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let body: Record<string, unknown>;
          try {
            body = JSON.parse(text) as Record<string, unknown>;
          } catch {
            body = { text };
          }
          done({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      },
    );
    req.on("error", fail);
    if (o.body !== undefined) req.write(JSON.stringify(o.body));
    req.end();
  });
}

const codeFor = (origin = `http://localhost:${port}`, now?: number) =>
  mintSignInCode(secret, origin, now === undefined ? {} : { now });

const signIn = (
  code: string,
  more: Record<string, unknown> = {},
  headers = {},
) =>
  send("POST", "/__ph/sign-in", {
    body: { code, sessionDid: SESSION, ...more },
    headers,
  });

describe("the sign-in endpoint", () => {
  it("says it is there, and gives a credential once for a code", async () => {
    expect((await send("GET", "/__ph/sign-in")).body).toEqual({
      available: true,
    });
    const code = codeFor();
    const first = await signIn(code);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      ok: true,
      identity: { kind: "pseudonym" },
    });
    expect(first.headers["cache-control"]).toBe("no-store");
    expect(first.headers["access-control-allow-origin"]).toBeUndefined();
    expect(asked).toEqual([
      { method: "signIn", args: { sessionDid: SESSION } },
    ]);
    const again = await signIn(code);
    expect(again).toMatchObject({ status: 401, body: { reason: "used-code" } });
    expect(asked).toHaveLength(1);
  });

  it("refuses a code of another origin, another secret, or past its time", async () => {
    expect(await signIn(codeFor(`http://localhost:${port + 1}`))).toMatchObject(
      {
        status: 401,
        body: { reason: "bad-code" },
      },
    );
    expect(
      await signIn(
        mintSignInCode(newSignInSecret(), `http://localhost:${port}`),
      ),
    ).toMatchObject({ status: 401, body: { reason: "bad-code" } });
    expect(
      await signIn(codeFor(undefined, Date.now() - 11 * 60_000)),
    ).toMatchObject({ status: 401, body: { reason: "expired-code" } });
    expect(asked).toEqual([]);
  });

  it("answers only this computer's own pages", async () => {
    const code = codeFor();
    const cases: [Record<string, string>, string][] = [
      [{ origin: "http://evil.example" }, "bad-origin"],
      [{ origin: "null" }, "bad-origin"],
      [{ origin: `http://127.0.0.1:${port}` }, "bad-origin"],
      [{ host: "evil.example", origin: "http://evil.example" }, "bad-host"],
      [
        {
          host: `localhost:${port + 1}`,
          origin: `http://localhost:${port + 1}`,
        },
        "bad-host",
      ],
      [{ "x-forwarded-for": "192.168.1.5" }, "not-local"],
      [{ "sec-fetch-site": "cross-site" }, "bad-origin"],
    ];
    for (const [headers, reason] of cases) {
      const answer = await signIn(code, {}, headers);
      expect(answer, JSON.stringify(headers)).toMatchObject({
        status: 403,
        body: { reason },
      });
      expect(answer.headers["access-control-allow-origin"]).toBeUndefined();
    }
    // A POST with no Origin is no page of this server's.
    const bare = await send("POST", "/__ph/sign-in", {
      headers: { origin: "" },
      body: { code, sessionDid: SESSION },
    });
    expect(bare.status).toBe(403);
    // A cross-origin preflight gets no CORS answer.
    const preflight = await send("OPTIONS", "/__ph/sign-in", {
      headers: {
        origin: "http://evil.example",
        "access-control-request-method": "POST",
      },
    });
    expect(preflight.status).toBe(403);
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
    expect(asked).toEqual([]);
    // The rest of the app keeps its open CORS.
    const page = await send("GET", "/index.html");
    expect(page.headers["access-control-allow-origin"]).toBe("*");
  });

  it("refuses a request from another machine", () => {
    const step = localSignInStep({
      secret,
      issuer: () => Promise.resolve(issuer),
      port: () => port,
    });
    let status = 0;
    let body = "";
    const res = {
      headersSent: false,
      writeHead: (code: number) => {
        status = code;
        return res;
      },
      end: (text: string) => {
        body = text;
      },
    } as unknown as ServerResponse;
    step(
      {
        url: "/__ph/sign-in",
        method: "GET",
        headers: { host: `localhost:${port}` },
        socket: { remoteAddress: "192.168.1.5" },
      } as unknown as IncomingMessage,
      res,
      () => {
        throw new Error("passed on");
      },
    );
    step.dispose();
    expect(status).toBe(403);
    expect(JSON.parse(body)).toEqual({ reason: "not-local" });
  });

  it("keeps a code while it asks the password, and burns it after five wrong ones", async () => {
    lockedUntilPassword = true;
    const code = codeFor();
    expect(await signIn(code)).toMatchObject({
      status: 423,
      body: { reason: "password-required" },
    });
    for (let left = 4; left >= 0; left--) {
      expect(await signIn(code, { password: "no" })).toMatchObject({
        status: 401,
        body: { reason: "wrong-password", triesLeft: left },
      });
    }
    expect(await signIn(code, { password: "pw" })).toMatchObject({
      status: 401,
      body: { reason: "used-code" },
    });
    const fresh = codeFor();
    expect((await signIn(fresh, { password: "pw" })).status).toBe(200);
  });

  it("renews and unlocks for a page's bearer, and asks for one", async () => {
    expect(await send("POST", "/__ph/renew", { body: {} })).toMatchObject({
      status: 401,
      body: { reason: "bad-bearer" },
    });
    const renewed = await send("POST", "/__ph/renew", {
      headers: { authorization: "Bearer page.jwt" },
      body: {},
    });
    expect(renewed.status).toBe(200);
    const unlocked = await send("POST", "/__ph/unlock", {
      headers: { authorization: "Bearer page.jwt" },
      body: { password: "pw", sessions: ["agent"] },
    });
    expect(unlocked).toMatchObject({ status: 200, body: { ok: true } });
    expect(
      await send("POST", "/__ph/unlock", {
        headers: { authorization: "Bearer page.jwt" },
        body: { sessions: ["agent"] },
      }),
    ).toMatchObject({ status: 400, body: { reason: "bad-request" } });
    expect(asked).toEqual([
      { method: "renew", args: { bearer: "page.jwt" } },
      {
        method: "unlock",
        args: { bearer: "page.jwt", password: "pw", sessions: ["agent"] },
      },
    ]);
    expect(await send("GET", "/__ph/renew")).toMatchObject({
      status: 405,
      body: { reason: "bad-method" },
    });
  });

  it("takes JSON only", async () => {
    const answer = await send("POST", "/__ph/sign-in", {
      headers: { "content-type": "text/plain" },
      body: { code: codeFor(), sessionDid: SESSION },
    });
    expect(answer).toMatchObject({
      status: 400,
      body: { reason: "bad-request" },
    });
  });
});
