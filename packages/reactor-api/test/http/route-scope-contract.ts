/**
 * Shared suite for HttpRouteService over an IHttpAdapter. Run against both
 * adapters: the whole point of the scope is that a package's routes behave
 * identically whichever framework the host chose.
 */
import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IHttpAdapter } from "../../src/graphql/gateway/types.js";
import { HttpRouteService } from "../../src/http/index.js";
import type { AuthService } from "../../src/services/auth.service.js";

export type ScopeHarness = {
  adapter: IHttpAdapter;
  url: string;
  close: () => Promise<void>;
};

export type ScopeHarnessFactory = () => Promise<ScopeHarness>;

/** Stands in for AuthService: any bearer but "bad" resolves to that user. */
function fakeAuthService(enabled = true): AuthService {
  return {
    verifyBearer: (authorization: string | undefined) => {
      if (authorization === "Bearer bad") {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "nope" }), { status: 403 }),
        );
      }
      const token = authorization?.replace(/^Bearer /, "");
      return Promise.resolve({
        user: token ? { address: token } : undefined,
        admins: [],
        auth_enabled: enabled,
      });
    },
  } as unknown as AuthService;
}

export function runRouteScopeTests(
  adapterName: string,
  createHarness: ScopeHarnessFactory,
): void {
  describe(`HttpRouteService (${adapterName})`, () => {
    let h: ScopeHarness;

    beforeEach(async () => {
      h = await createHarness();
    });
    afterEach(async () => {
      await h.close();
    });

    function service(options?: {
      basePath?: string;
      authService?: AuthService;
      publicUrl?: string;
      trustProxy?: boolean;
    }) {
      return new HttpRouteService({
        httpAdapter: h.adapter,
        basePath: options?.basePath,
        authService: options?.authService,
        publicUrl: options?.publicUrl,
        trustProxy: options?.trustProxy,
      });
    }

    // ── teardown ───────────────────────────────────────────────────────────

    describe("releasing a package's routes", () => {
      it("stops answering once the service disposes the scope", async () => {
        // What the host does when a package is removed. The package itself
        // holds no handles here — it registered and forgot, which is the normal
        // case — so disposal has to work from the service side alone.
        const routes = service();
        routes
          .scopeFor("pkg")
          .get("ping", { auth: "public" }, () => Response.json({ ok: true }));

        expect((await fetch(`${h.url}/api/pkg/ping`)).status).toBe(200);

        routes.disposeScope("pkg");

        expect((await fetch(`${h.url}/api/pkg/ping`)).status).toBe(404);
      });

      it("releases every scope on shutdown, host scopes included", async () => {
        const routes = service();
        routes
          .scopeFor("pkg")
          .get("ping", { auth: "public" }, () => Response.json({ ok: true }));
        routes
          .hostScope("host", "/hooks")
          .get("ping", { auth: "public" }, () => Response.json({ ok: true }));

        expect((await fetch(`${h.url}/api/pkg/ping`)).status).toBe(200);
        expect((await fetch(`${h.url}/hooks/ping`)).status).toBe(200);

        routes.disposeAll();

        expect((await fetch(`${h.url}/api/pkg/ping`)).status).toBe(404);
        expect((await fetch(`${h.url}/hooks/ping`)).status).toBe(404);
      });

      it("lets the same package register again after disposal", async () => {
        // A reload is a dispose followed by a register, so the namespace must
        // not stay claimed by the scope that just went away.
        const routes = service();
        routes
          .scopeFor("pkg")
          .get("ping", { auth: "public" }, () =>
            Response.json({ generation: 1 }),
          );
        routes.disposeScope("pkg");
        routes
          .scopeFor("pkg")
          .get("ping", { auth: "public" }, () =>
            Response.json({ generation: 2 }),
          );

        const res = await fetch(`${h.url}/api/pkg/ping`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ generation: 2 });
      });
    });

    // ── host scopes ────────────────────────────────────────────────────────

    describe("a scope the host mounts itself", () => {
      // Namespacing is a package policy, not a property of route hosting. The
      // host owns the URL space and serves endpoints at paths that are part of
      // a published contract — a webhook URL a provider registered, a protocol
      // endpoint a client is configured with — so those cannot move under a
      // namespace. A package never gets this: it only ever receives a scope.
      it("serves at the path the host named, with no namespace in it", async () => {
        const scope = service().hostScope(
          "@powerhousedao/reactor-api",
          "/webhooks",
        );
        scope.nodeRoute({
          method: "POST",
          path: ":token",
          auth: "public",
          handler: (_req, res, ctx) => {
            res.writeHead(200, { "content-type": "text/plain" });
            res.end(ctx.params.token);
          },
        });

        const res = await fetch(`${h.url}/webhooks/abc123`, { method: "POST" });
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("abc123");
      });

      it("refuses to mount inside the package prefix", () => {
        // Otherwise a host group could shadow a package's namespace, which is
        // the one thing the structural prefix exists to prevent.
        expect(() =>
          service().hostScope("host", "/api/@powerhousedao/workflow"),
        ).toThrow(/package route prefix/);
        expect(() => service().hostScope("host", "/api")).toThrow(
          /package route prefix/,
        );
      });

      it("refuses a path that is not one literal prefix", () => {
        const routes = service();
        expect(() => routes.hostScope("host", "webhooks")).toThrow(
          /must be absolute/,
        );
        expect(() => routes.hostScope("host", "/")).toThrow(/whole URL space/);
        expect(() => routes.hostScope("host", "/a/../b")).toThrow(
          /must not contain/,
        );
        expect(() => routes.hostScope("host", "/hooks/:token")).toThrow(
          /literal prefix/,
        );
      });

      it("does not move when the host base path changes", async () => {
        // A URL a third party already holds has to keep working.
        const scope = service({ basePath: "/reactor" }).hostScope(
          "host",
          "/webhooks",
        );
        scope.get("ping", { auth: "public" }, () => new Response("pong"));

        expect((await fetch(`${h.url}/webhooks/ping`)).status).toBe(200);
        expect((await fetch(`${h.url}/reactor/webhooks/ping`)).status).toBe(
          404,
        );
      });

      it("refuses a second owner at one path", () => {
        const routes = service();
        routes.hostScope("first", "/webhooks");
        expect(() => routes.hostScope("second", "/webhooks")).toThrow(
          /already holds/,
        );
        // The same owner asking twice gets the same scope, so a reload cannot
        // accumulate mounts.
        expect(routes.hostScope("first", "/webhooks")).toBe(
          routes.hostScope("first", "/webhooks"),
        );
      });

      it("has no webhooks of its own", async () => {
        // A token-addressed endpoint belongs to whoever minted the token, which
        // is always a package.
        const scope = service().hostScope("host", "/webhooks");
        await expect(
          scope.webhooks.register({
            name: "x",
            onRequest: () => ({ status: 202 }),
          }),
        ).rejects.toThrow();
      });
    });

    // ── refusals ───────────────────────────────────────────────────────────

    describe("a custom authorizer", () => {
      it("may answer a refusal in its own envelope", async () => {
        // A protocol endpoint refuses in the shape its clients parse. Without
        // this it would have to declare itself `public` and gate inside the
        // handler, which hides it from an inventory of unauthenticated routes.
        const scope = service().scopeFor("pkg");
        scope.post(
          "rpc",
          {
            auth: () => ({
              authorized: false,
              response: Response.json(
                { jsonrpc: "2.0", error: { code: -32001, message: "no" } },
                { status: 401 },
              ),
            }),
          },
          () => new Response("unreachable"),
        );

        const res = await fetch(`${h.url}/api/pkg/rpc`, { method: "POST" });
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({
          jsonrpc: "2.0",
          error: { code: -32001, message: "no" },
        });
      });
    });

    // ── forwarded headers ──────────────────────────────────────────────────

    describe("whether the forwarded origin is believed", () => {
      async function originSeenByHandler(trustProxy: boolean): Promise<string> {
        const scope = service({ trustProxy }).scopeFor("pkg");
        scope.get("where", { auth: "public" }, (_req, ctx) =>
          Response.json({ baseUrl: ctx.transport.baseUrl }),
        );

        const res = await fetch(`${h.url}/api/pkg/where`, {
          headers: {
            "x-forwarded-proto": "https",
            "x-forwarded-host": "evil.example",
            "x-forwarded-prefix": "/hijacked",
          },
        });
        return ((await res.json()) as { baseUrl: string }).baseUrl;
      }

      it("believes the forwarded origin when the host trusts its proxy", async () => {
        // The deployed topology: the balancer sets these, and they name the
        // origin a caller actually reached.
        expect(await originSeenByHandler(true)).toBe(
          "https://evil.example/hijacked",
        );
      });

      it("ignores the forwarded origin when the host does not trust it", async () => {
        // The headers are client-written. Untrusted, a caller must not be able
        // to choose the origin a package hands to a third party.
        const baseUrl = await originSeenByHandler(false);
        expect(baseUrl).not.toContain("evil.example");
        expect(baseUrl).not.toContain("hijacked");
        expect(baseUrl).toMatch(
          /^http:\/\/127\.0\.0\.1:\d+$|^http:\/\/localhost:\d+$/,
        );
      });
    });

    // ── advertised URLs ────────────────────────────────────────────────────

    describe("advertised URLs", () => {
      // A package hands these to a third party — a provider callback, an asset
      // link in a document. A path is useless there, so both are absolute
      // whenever the host knows its own origin.
      it("advertises an absolute base and route URL", () => {
        const scope = service({
          publicUrl: "https://switchboard.example",
        }).scopeFor("@powerhousedao/workflow");

        expect(scope.baseUrl).toBe(
          "https://switchboard.example/api/@powerhousedao/workflow",
        );
        expect(
          scope.get("runs/:id", { auth: "public" }, () => new Response("")).url,
        ).toBe(
          "https://switchboard.example/api/@powerhousedao/workflow/runs/:id",
        );
      });

      it("keeps the host's base path inside the advertised URL", () => {
        const scope = service({
          basePath: "/reactor",
          publicUrl: "https://switchboard.example",
        }).scopeFor("document-model");

        expect(scope.baseUrl).toBe(
          "https://switchboard.example/reactor/api/document-model",
        );
      });

      it("ignores a trailing slash on the configured origin", () => {
        const scope = service({
          publicUrl: "https://switchboard.example/",
        }).scopeFor("document-model");

        expect(scope.baseUrl).toBe(
          "https://switchboard.example/api/document-model",
        );
      });

      it("degrades to a path when the host knows no public origin", () => {
        // The only case where the "absolute" contract cannot be met. Worth
        // asserting so it stays a deliberate fallback rather than the default.
        const scope = service().scopeFor("document-model");
        expect(scope.baseUrl).toBe("/api/document-model");
      });
    });

    // ── namespacing ────────────────────────────────────────────────────────

    it("serves a scoped package name as two path segments", async () => {
      const scope = service().scopeFor("@powerhousedao/workflow");
      scope.get("runs/:id", { auth: "public" }, (_req, ctx) =>
        Response.json({ id: ctx.params.id }),
      );

      const res = await fetch(`${h.url}/api/@powerhousedao/workflow/runs/42`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: "42" });
    });

    it("serves an unscoped package name as one segment", async () => {
      const scope = service().scopeFor("document-model");
      scope.get("ping", { auth: "public" }, () => new Response("pong"));

      const res = await fetch(`${h.url}/api/document-model/ping`);
      expect(await res.text()).toBe("pong");
    });

    it("also answers the percent-encoded spelling of a scoped name", async () => {
      // Both routers match the raw pathname, so a client that encodes each
      // segment would otherwise get a 404 on a URL that is equivalent.
      const scope = service().scopeFor("@powerhousedao/workflow");
      scope.get("ping", { auth: "public" }, () => new Response("pong"));

      const res = await fetch(`${h.url}/api/%40powerhousedao/workflow/ping`);
      expect(await res.text()).toBe("pong");
    });

    it("nests the package prefix inside the host base path", async () => {
      // BASE_PATH=/api would otherwise move core routes into the package
      // space; nesting puts packages at /api/api and leaves core at /api/*.
      const scope = service({ basePath: "/api" }).scopeFor("pkg");
      scope.get("ping", { auth: "public" }, () => new Response("pong"));

      expect((await fetch(`${h.url}/api/api/pkg/ping`)).status).toBe(200);
      expect((await fetch(`${h.url}/api/pkg/ping`)).status).toBe(404);
    });

    it("refuses an absolute route path", () => {
      const scope = service().scopeFor("pkg");
      expect(() =>
        scope.get("/escape", { auth: "public" }, () => new Response("x")),
      ).toThrow(/must be relative/);
    });

    it("refuses a route path that climbs out of the scope", () => {
      const scope = service().scopeFor("pkg");
      expect(() =>
        scope.get("../escape", { auth: "public" }, () => new Response("x")),
      ).toThrow(/must not contain/);
    });

    it("refuses a package name that is not a package name", () => {
      expect(() => service().scopeFor("/Users/me/project")).toThrow();
      expect(() => service().scopeFor("@scope/a/b")).toThrow();
    });

    it("returns the same scope for the same package", () => {
      const svc = service();
      expect(svc.scopeFor("pkg")).toBe(svc.scopeFor("pkg"));
    });

    it("refuses a duplicate method and path within one scope", () => {
      const scope = service().scopeFor("pkg");
      scope.get("ping", { auth: "public" }, () => new Response("a"));
      expect(() =>
        scope.get("ping", { auth: "public" }, () => new Response("b")),
      ).toThrow(/already registered/);
    });

    // ── auth ───────────────────────────────────────────────────────────────

    it("defaults a route to requiring a bearer", async () => {
      const scope = service({ authService: fakeAuthService() }).scopeFor("pkg");
      scope.get("secret", () => new Response("shhh"));

      expect((await fetch(`${h.url}/api/pkg/secret`)).status).toBe(401);

      const authed = await fetch(`${h.url}/api/pkg/secret`, {
        headers: { authorization: "Bearer alice" },
      });
      expect(await authed.text()).toBe("shhh");
    });

    it("passes the resolved user to the handler", async () => {
      const scope = service({ authService: fakeAuthService() }).scopeFor("pkg");
      scope.get("me", (_req, ctx) => Response.json({ user: ctx.user ?? null }));

      const res = await fetch(`${h.url}/api/pkg/me`, {
        headers: { authorization: "Bearer alice" },
      });
      expect(await res.json()).toEqual({ user: { address: "alice" } });
    });

    it("lets an anonymous caller through when the route allows it", async () => {
      // No user, but auth is on: the pair tells this apart from a host with
      // authentication disabled, where such a handler must refuse instead.
      const scope = service({ authService: fakeAuthService() }).scopeFor("pkg");
      scope.get("maybe", { auth: "renown-optional" }, (_req, ctx) =>
        Response.json({ user: ctx.user ?? null, authEnabled: ctx.authEnabled }),
      );

      const res = await fetch(`${h.url}/api/pkg/maybe`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ user: null, authEnabled: true });
    });

    it("relays the auth service's own rejection", async () => {
      const scope = service({ authService: fakeAuthService() }).scopeFor("pkg");
      scope.get("secret", () => new Response("shhh"));

      const res = await fetch(`${h.url}/api/pkg/secret`, {
        headers: { authorization: "Bearer bad" },
      });
      expect(res.status).toBe(403);
    });

    it("treats every caller as anonymous when auth is disabled host-wide", async () => {
      const scope = service().scopeFor("pkg");
      scope.get("open", (_req, ctx) =>
        Response.json({ authEnabled: ctx.authEnabled }),
      );

      const res = await fetch(`${h.url}/api/pkg/open`);
      expect(await res.json()).toEqual({ authEnabled: false });
    });

    it("runs a custom authorizer before the handler", async () => {
      const scope = service().scopeFor("pkg");
      const authorizer = (req: IncomingMessage) =>
        req.headers["x-secret"] === "let-me-in"
          ? ({ authorized: true } as const)
          : ({
              authorized: false,
              status: 418,
              message: "no",
            } as const);

      scope.get("gated", { auth: authorizer }, () => new Response("in"));

      expect((await fetch(`${h.url}/api/pkg/gated`)).status).toBe(418);
      const ok = await fetch(`${h.url}/api/pkg/gated`, {
        headers: { "x-secret": "let-me-in" },
      });
      expect(await ok.text()).toBe("in");
    });

    // ── bodies ─────────────────────────────────────────────────────────────

    it("hands a raw route the exact bytes received", async () => {
      const exact = '{"b":1,  "a":2}';
      let seen: string | undefined;

      const scope = service().scopeFor("pkg");
      scope.post("hook", { auth: "public", body: "raw" }, (_req, ctx) => {
        seen = ctx.rawBody?.toString("utf8");
        return new Response(null, { status: 204 });
      });

      await fetch(`${h.url}/api/pkg/hook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: exact,
      });

      expect(seen).toBe(exact);
    });

    it("gives the Fetch Request a byte-exact body too", async () => {
      const exact = '{"b":1,  "a":2}';
      let seen: string | undefined;

      const scope = service().scopeFor("pkg");
      scope.post("echo", { auth: "public" }, async (req) => {
        seen = await req.text();
        return new Response(null, { status: 204 });
      });

      await fetch(`${h.url}/api/pkg/echo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: exact,
      });

      expect(seen).toBe(exact);
    });

    it("refuses a body past maxBodyBytes with 413", async () => {
      const scope = service().scopeFor("pkg");
      scope.post(
        "small",
        { auth: "public", maxBodyBytes: 8 },
        () => new Response("ok"),
      );

      const res = await fetch(`${h.url}/api/pkg/small`, {
        method: "POST",
        body: "x".repeat(64),
      });
      expect(res.status).toBe(413);
    });

    it("parses JSON through the Fetch Request", async () => {
      const scope = service().scopeFor("pkg");
      scope.post("json", { auth: "public" }, async (req) =>
        Response.json(await req.json()),
      );

      const res = await fetch(`${h.url}/api/pkg/json`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hello: "world" }),
      });
      expect(await res.json()).toEqual({ hello: "world" });
    });

    // ── responses ──────────────────────────────────────────────────────────

    it("streams a response body", async () => {
      const scope = service().scopeFor("pkg");
      scope.get("stream", { auth: "public" }, () => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("first\n"));
            // Closed on the next tick, after the first chunk is on the wire.
            // Guarded because the client cancels, which closes it first.
            setTimeout(() => {
              try {
                controller.close();
              } catch {
                // Already closed by the cancel.
              }
            }, 50);
          },
        });
        return new Response(body);
      });

      const res = await fetch(`${h.url}/api/pkg/stream`);
      const reader = res.body!.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toBe("first\n");
      await reader.cancel();
    });

    it("answers a HEAD route with headers only", async () => {
      const scope = service().scopeFor("pkg");
      scope.head(
        "thing",
        { auth: "public" },
        () => new Response("ignored", { headers: { "x-size": "9" } }),
      );

      const res = await fetch(`${h.url}/api/pkg/thing`, { method: "HEAD" });
      expect(res.headers.get("x-size")).toBe("9");
      expect(await res.text()).toBe("");
    });

    it("answers 500 when a handler throws, without leaking the error", async () => {
      const scope = service().scopeFor("pkg");
      scope.get("boom", { auth: "public" }, () => {
        throw new Error("secret internal detail");
      });

      const res = await fetch(`${h.url}/api/pkg/boom`);
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain("secret internal detail");
    });

    // ── disposal ───────────────────────────────────────────────────────────

    it("stops serving a disposed route", async () => {
      const scope = service().scopeFor("pkg");
      const handle = scope.get(
        "gone",
        { auth: "public" },
        () => new Response("here"),
      );

      expect((await fetch(`${h.url}/api/pkg/gone`)).status).toBe(200);
      handle.dispose();
      expect((await fetch(`${h.url}/api/pkg/gone`)).status).toBe(404);
    });

    it("releases every route when the scope is disposed", async () => {
      const svc = service();
      const scope = svc.scopeFor("pkg");
      scope.get("a", { auth: "public" }, () => new Response("a"));
      scope.get("b", { auth: "public" }, () => new Response("b"));

      expect((await fetch(`${h.url}/api/pkg/a`)).status).toBe(200);
      svc.disposeScope("pkg");
      expect((await fetch(`${h.url}/api/pkg/a`)).status).toBe(404);
      expect((await fetch(`${h.url}/api/pkg/b`)).status).toBe(404);
    });

    it("lets a package re-register its routes after a reload", async () => {
      const svc = service();
      svc.scopeFor("pkg").get("v", { auth: "public" }, () => new Response("1"));
      svc.disposeScope("pkg");
      svc.scopeFor("pkg").get("v", { auth: "public" }, () => new Response("2"));

      expect(await (await fetch(`${h.url}/api/pkg/v`)).text()).toBe("2");
    });

    // ── node escape hatch ──────────────────────────────────────────────────

    it("mounts a node route inside the namespace", async () => {
      const scope = service().scopeFor("pkg");
      scope.nodeRoute({
        method: "GET",
        path: "raw-node/:id",
        auth: "public",
        handler: (_req, res, ctx) => {
          res.statusCode = 200;
          res.end(`id=${ctx.params.id}`);
        },
      });

      const res = await fetch(`${h.url}/api/pkg/raw-node/7`);
      expect(await res.text()).toBe("id=7");
    });
  });
}
