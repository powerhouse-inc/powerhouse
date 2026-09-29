// The OAuth2 callback over a real socket through the reactor's route service,
// and what startOAuth accepts as a redirect and a return URL.
import {
  createHttpAdapter,
  HttpRouteService,
  type Context,
  type IAuthorizationService,
} from "@powerhousedao/reactor-api";
import type { WorkflowRuntimeService } from "@powerhousedao/reactor-workflow";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  callbackUrlOf,
  registerOAuthCallback,
} from "../../src/workflow/oauth-callback.js";
import { getResolvers } from "../../src/workflow/resolvers.js";

const PACKAGE_NAME = "@powerhousedao/workflow";

type Resolver = (
  parent: unknown,
  args: unknown,
  ctx: Context,
) => Promise<unknown>;

describe("the OAuth2 callback route", () => {
  let url: string;
  let callbackUrl: string;
  const completeOAuth = vi.fn();
  let close: () => Promise<void>;

  beforeAll(async () => {
    const { adapter } = await createHttpAdapter("express");
    adapter.setupMiddleware({});
    const server = await adapter.listen(0, undefined, "127.0.0.1");
    const { port } = server.address() as { port: number };
    url = `http://127.0.0.1:${port}`;
    const routes = new HttpRouteService({
      httpAdapter: adapter,
      publicUrl: url,
    });
    const scope = routes.scopeFor(PACKAGE_NAME);
    registerOAuthCallback(scope, { completeOAuth } as never);
    callbackUrl = callbackUrlOf(scope);
    close = () => new Promise((done) => server.close(() => done()));
  });

  afterAll(() => close());

  it("lives under the workflow package's namespace", () => {
    expect(callbackUrl).toBe(
      `${url}/api/@powerhousedao/workflow/oauth/callback`,
    );
  });

  it("hands the provider's answer to the runtime and says it is done", async () => {
    completeOAuth.mockResolvedValueOnce({
      ok: true,
      detail: null,
      returnUrl: null,
    });
    const response = await fetch(`${callbackUrl}?state=s1&code=c1`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("<h1>Connected</h1>");
    expect(completeOAuth).toHaveBeenLastCalledWith({
      state: "s1",
      code: "c1",
      error: undefined,
      errorDescription: undefined,
    });
  });

  it("shows a failure without letting it write markup", async () => {
    completeOAuth.mockResolvedValueOnce({
      ok: false,
      detail: "<script>alert(1)</script>",
      returnUrl: null,
    });
    const response = await fetch(`${callbackUrl}?state=s2&error=access_denied`);
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("window.close");
  });

  it("sends a full-page sign-in back where it started", async () => {
    completeOAuth.mockResolvedValueOnce({
      ok: true,
      detail: null,
      returnUrl: "https://connect.example/d/drive?tab=x",
    });
    const response = await fetch(`${callbackUrl}?state=s3&code=c3`, {
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://connect.example/d/drive?tab=x&ph_oauth=s3",
    );
  });

  it("refuses a request with no state", async () => {
    completeOAuth.mockClear();
    const response = await fetch(`${callbackUrl}?code=c4`);
    expect(response.status).toBe(400);
    expect(completeOAuth).not.toHaveBeenCalled();
  });
});

describe("startOAuth", () => {
  const ORIGIN = "https://connect.example";
  const ctx = (origin?: string) =>
    ({
      headers: origin ? { origin } : {},
      db: {},
      user: { address: "0xadmin" },
    }) as unknown as Context;

  function build(callbackUrl: string | undefined, isAdmin = true) {
    const runtime = {
      startOAuth: vi.fn(() => Promise.resolve({})),
    };
    const resolvers = getResolvers(
      runtime as unknown as WorkflowRuntimeService,
      { isSupremeAdmin: () => isAdmin } as unknown as IAuthorizationService,
      callbackUrl ? { callbackUrl } : undefined,
    ) as Record<string, Record<string, Resolver>>;
    return {
      runtime,
      start: resolvers.WorkflowRuntimeMutations.startOAuth,
      redirectUri: resolvers.WorkflowRuntimeQueries.oauthRedirectUri,
    };
  }

  const PATH = "/api/@powerhousedao/workflow/oauth/callback";

  it("is an administrator's, like minting a secret", () => {
    const { start } = build(`https://sb.example${PATH}`, false);
    expect(() => start({}, { connectionId: "c1" }, ctx())).toThrow(
      "Admin access required",
    );
  });

  it("uses the host's own redirect when it knows its origin", async () => {
    const { runtime, start } = build(`https://sb.example${PATH}`);
    await start(
      {},
      { connectionId: "c1", redirectUri: `https://evil.example${PATH}` },
      ctx(),
    );
    expect(runtime.startOAuth).toHaveBeenCalledWith("c1", expect.anything(), {
      redirectUri: `https://sb.example${PATH}`,
    });
  });

  it("takes the caller's redirect only when it names this host's path", async () => {
    const { runtime, start, redirectUri } = build(PATH);
    expect(redirectUri({}, {}, ctx())).toBe(PATH);
    expect(() => start({}, { connectionId: "c1" }, ctx())).toThrow(
      "pass redirectUri",
    );
    expect(() =>
      start(
        {},
        { connectionId: "c1", redirectUri: "http://localhost:4001/elsewhere" },
        ctx(),
      ),
    ).toThrow(`redirectUri must be this host's ${PATH}`);
    await start(
      {},
      { connectionId: "c1", redirectUri: `http://localhost:4001${PATH}` },
      ctx(),
    );
    expect(runtime.startOAuth).toHaveBeenLastCalledWith(
      "c1",
      expect.anything(),
      { redirectUri: `http://localhost:4001${PATH}` },
    );
  });

  it("returns a full-page sign-in only to the page that asked", async () => {
    const { runtime, start } = build(`https://sb.example${PATH}`);
    expect(() =>
      start(
        {},
        { connectionId: "c1", returnUrl: "https://evil.example/" },
        ctx(ORIGIN),
      ),
    ).toThrow("returnUrl must be on the requesting page's origin");
    expect(() =>
      start({}, { connectionId: "c1", returnUrl: `${ORIGIN}/d` }, ctx()),
    ).toThrow("returnUrl must be on the requesting page's origin");
    await start(
      {},
      { connectionId: "c1", returnUrl: `${ORIGIN}/d?x=1` },
      ctx(ORIGIN),
    );
    expect(runtime.startOAuth).toHaveBeenLastCalledWith(
      "c1",
      expect.anything(),
      {
        redirectUri: `https://sb.example${PATH}`,
        returnUrl: `${ORIGIN}/d?x=1`,
      },
    );
  });

  it("has no redirect to offer on a host without HTTP routes", () => {
    const { redirectUri, start } = build(undefined);
    expect(redirectUri({}, {}, ctx())).toBeNull();
    expect(() => start({}, { connectionId: "c1" }, ctx())).toThrow(
      "This host serves no OAuth2 callback",
    );
  });
});
