import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpressHttpAdapter } from "../../src/graphql/gateway/adapter-http-express.js";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import type { Kysely } from "kysely";
import {
  HttpRouteService,
  MemoryWebhookStore,
  RelationalWebhookStore,
  WebhookService,
  type WebhookRequest,
} from "../../src/http/index.js";
import { getDbClient } from "../../src/utils/db.js";

describe("WebhookService", () => {
  let adapter: ExpressHttpAdapter;
  let url: string;
  let close: () => Promise<void>;
  let webhooks: WebhookService;
  let routes: HttpRouteService;

  beforeEach(async () => {
    adapter = new ExpressHttpAdapter();
    adapter.setupMiddleware({});
    const server = await adapter.listen(0);
    const addr = server.address() as { port: number };
    url = `http://127.0.0.1:${addr.port}`;
    close = () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );

    webhooks = new WebhookService({ store: new MemoryWebhookStore() });
    routes = new HttpRouteService({ httpAdapter: adapter, webhooks });
    // The endpoint family serves from a host scope, exactly as the reactor
    // wires it: nothing here reaches the adapter directly.
    webhooks.attach(
      routes.hostScope("@powerhousedao/reactor-api", "/webhooks"),
    );
  });

  afterEach(async () => {
    await close();
  });

  function scope(packageName = "@powerhousedao/workflow") {
    return routes.scopeFor(packageName);
  }

  // ── the policy is per endpoint, not per registration ─────────────────────

  it("answers the challenge with the field the endpoint asked for", async () => {
    // One family serves every document, so a document-only field must arrive
    // via policyFor; off the registration it skips verification, starting a run.
    const handler = vi.fn(() => ({ status: 202 }));
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => ({ challengeField: "challenge" }),
      onRequest: handler,
    });
    const { token } = await endpoints.endpointFor("doc-1");

    const res = await fetch(`${url}/webhooks/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challenge: "abc123", type: "url_verification" }),
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("abc123");
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands back when the endpoint was minted", async () => {
    // The caller needs this to show an author when the URL came into being,
    // and getting it from the mint saves listing every endpoint to find one.
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      onRequest: () => ({ status: 202 }),
    });

    const minted = await endpoints.endpointFor("doc-1");
    expect(Number.isNaN(Date.parse(minted.createdAt))).toBe(false);

    const [listed] = await endpoints.list();
    expect(listed.createdAt).toBe(minted.createdAt);
  });

  it("mints an opaque token that is not the caller's key", async () => {
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      onRequest: () => ({ status: 202 }),
    });

    const { url: endpointUrl, token } =
      await endpoints.endpointFor("document-abc");

    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(endpointUrl).toBe(`/webhooks/${token}`);
    // The document id must not be recoverable from the URL.
    expect(endpointUrl).not.toContain("document-abc");
  });

  it("returns the same endpoint for the same key", async () => {
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      onRequest: () => ({ status: 202 }),
    });

    const first = await endpoints.endpointFor("doc-1");
    const second = await endpoints.endpointFor("doc-1");

    // A second URL would leave a provider registered against a dead one.
    expect(second.token).toBe(first.token);
  });

  it("delivers to the handler with the caller's key", async () => {
    const seen: WebhookRequest[] = [];
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      onRequest: (request) => {
        seen.push(request);
        return { status: 202, body: "accepted" };
      },
    });
    const { token } = await endpoints.endpointFor("doc-1");

    const res = await fetch(`${url}/webhooks/${token}?a=1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });

    expect(res.status).toBe(202);
    expect(await res.text()).toBe("accepted");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.key).toBe("doc-1");
    expect(seen[0]!.body).toEqual({ hello: "world" });
    expect(seen[0]!.queryParams).toEqual({ a: "1" });
  });

  it("answers a disarmed endpoint exactly as an unknown token", async () => {
    // A prober must not be able to tell a live endpoint from a dead one.
    let armed = true;
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => (armed ? {} : undefined),
      onRequest: () => ({ status: 202 }),
    });
    const { token } = await endpoints.endpointFor("doc-1");

    expect(
      (await fetch(`${url}/webhooks/${token}`, { method: "POST" })).status,
    ).toBe(202);
    armed = false;
    const disarmed = await fetch(`${url}/webhooks/${token}`, {
      method: "POST",
    });
    const unknown = await fetch(`${url}/webhooks/${"0".repeat(32)}`, {
      method: "POST",
    });
    expect(disarmed.status).toBe(unknown.status);
    expect(await disarmed.text()).toBe(await unknown.text());
  });

  it("dedupes on a header, where some senders put the delivery id", async () => {
    // Query and top-level body alone leave a header-carried delivery id
    // undedupable, and the prefixed-digest scheme exists for just those senders.
    const handler = vi.fn(() => ({ status: 202 }));
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => ({
        dedupe: { field: { header: "x-github-delivery" } },
      }),
      onRequest: handler,
    });
    const { token } = await endpoints.endpointFor("doc-1");

    const send = () =>
      fetch(`${url}/webhooks/${token}`, {
        method: "POST",
        headers: { "x-github-delivery": "abc-123" },
      });

    expect((await send()).status).toBe(202);
    expect((await send()).status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("dedupes on a nested body path", async () => {
    const handler = vi.fn(() => ({ status: 202 }));
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => ({ dedupe: { field: { body: "payload.event.id" } } }),
      onRequest: handler,
    });
    const { token } = await endpoints.endpointFor("doc-1");

    const send = () =>
      fetch(`${url}/webhooks/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: { event: { id: "evt_nested" } } }),
      });

    expect((await send()).status).toBe(202);
    expect((await send()).status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("answers a challenge a provider echoes in a header", async () => {
    const handler = vi.fn(() => ({ status: 202 }));
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => ({ challengeField: { header: "x-hub-challenge" } }),
      onRequest: handler,
    });
    const { token } = await endpoints.endpointFor("doc-1");

    const res = await fetch(`${url}/webhooks/${token}`, {
      method: "POST",
      headers: { "x-hub-challenge": "echo-me" },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("echo-me");
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets an endpoint's policy override the registration's default", async () => {
    // What the defaults/policy split is for: a family-wide value that one
    // endpoint may widen, with the two kept distinguishable.
    const handler = vi.fn(() => ({ status: 202 }));
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      defaults: { methods: ["POST"] },
      policyFor: (key) =>
        key === "doc-open" ? { methods: ["POST", "PUT"] } : {},
      onRequest: handler,
    });
    const strict = await endpoints.endpointFor("doc-1");
    const open = await endpoints.endpointFor("doc-open");

    expect(
      (await fetch(`${url}/webhooks/${strict.token}`, { method: "PUT" }))
        .status,
    ).toBe(405);
    expect(
      (await fetch(`${url}/webhooks/${open.token}`, { method: "PUT" })).status,
    ).toBe(202);
  });

  it("tells a package whether the URL it advertises is absolute", () => {
    // A package hands this URL to a third party, which will reject a path.
    // This harness configures no public origin, so the answer is no.
    expect(scope().webhooks.hasPublicOrigin).toBe(false);
  });

  it("answers 404 for an unknown token", async () => {
    const res = await fetch(`${url}/webhooks/${"0".repeat(32)}`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("never routes one package's token into another's handler", async () => {
    const mine = await scope("@acme/one").webhooks.register({
      name: "trigger",
      onRequest: () => ({ status: 200, body: "one" }),
    });
    await scope("@acme/two").webhooks.register({
      name: "trigger",
      onRequest: () => ({ status: 200, body: "two" }),
    });

    const { token } = await mine.endpointFor("doc-1");
    const res = await fetch(`${url}/webhooks/${token}`, { method: "POST" });

    expect(await res.text()).toBe("one");
  });

  // ── signature verification ───────────────────────────────────────────────

  it("accepts a prefixed-digest signature over the exact bytes", async () => {
    const secret = "s3cret";
    const handler = vi.fn(() => ({ status: 202 }));
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => ({ verify: { scheme: "hmac-prefixed", secret } }),
      onRequest: handler,
    });
    const { token } = await endpoints.endpointFor("doc-1");

    // Deliberately not canonical JSON: a re-encode would change these bytes
    // and the signature would stop matching.
    const body = '{"b":1,  "a":2}';
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

    const res = await fetch(`${url}/webhooks/${token}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
      },
      body,
    });

    expect(res.status).toBe(202);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("refuses a bad signature without invoking the handler", async () => {
    const handler = vi.fn(() => ({ status: 202 }));
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => ({
        verify: { scheme: "hmac-prefixed", secret: "s3cret" },
      }),
      onRequest: handler,
    });
    const { token } = await endpoints.endpointFor("doc-1");

    const res = await fetch(`${url}/webhooks/${token}`, {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      body: "{}",
    });

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("names the rejecting package in full when it is scoped", async () => {
    // The logger reads `@word` as a replacement token, so an interpolated
    // scoped name is substituted away and the operator reads `null/...`.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const endpoints = await scope("@powerhousedao/example").webhooks.register(
        {
          name: "stripe",
          policyFor: () => ({
            verify: { scheme: "hmac-prefixed", secret: "s3cret" },
          }),
          onRequest: () => ({ status: 202 }),
        },
      );
      const { token } = await endpoints.endpointFor("doc-1");

      await fetch(`${url}/webhooks/${token}`, {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=deadbeef" },
        body: "{}",
      });

      const line = warn.mock.calls.map((args) => String(args[0])).join("\n");
      expect(line).toContain("@powerhousedao/example/stripe");
      expect(line).not.toContain("null/");
    } finally {
      warn.mockRestore();
    }
  });

  it("resolves the secret per endpoint key", async () => {
    const secrets: Record<string, string> = { "doc-1": "one", "doc-2": "two" };
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: (key) => ({
        verify: { scheme: "hmac", secret: secrets[key] },
      }),
      onRequest: () => ({ status: 202 }),
    });

    const first = await endpoints.endpointFor("doc-1");
    const second = await endpoints.endpointFor("doc-2");
    const body = "payload";

    const sign = (secret: string) =>
      createHmac("sha256", secret).update(body).digest("hex");

    const ok = await fetch(`${url}/webhooks/${second.token}`, {
      method: "POST",
      headers: { "x-signature": sign("two") },
      body,
    });
    expect(ok.status).toBe(202);

    // doc-1's secret must not verify doc-2's endpoint.
    const wrong = await fetch(`${url}/webhooks/${second.token}`, {
      method: "POST",
      headers: { "x-signature": sign("one") },
      body,
    });
    expect(wrong.status).toBe(401);

    expect(first.token).not.toBe(second.token);
  });

  it("verifies a sha1 digest, whose default label follows the algorithm", async () => {
    // Senders that chose earlier still sign this way; the label follows the
    // algorithm rather than sha256, so `sha1=` holds with no prefix named.
    const secret = "s3cret";
    const handler = vi.fn(() => ({ status: 202 }));
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => ({
        verify: {
          scheme: "hmac-prefixed",
          secret,
          algorithm: "sha1",
          header: "x-hub-signature",
        },
      }),
      onRequest: handler,
    });
    const { token } = await endpoints.endpointFor("doc-1");
    const body = '{"a":1}';

    const res = await fetch(`${url}/webhooks/${token}`, {
      method: "POST",
      headers: {
        "x-hub-signature": `sha1=${createHmac("sha1", secret).update(body).digest("hex")}`,
      },
      body,
    });

    expect(res.status).toBe(202);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("verifies a base64 digest without folding its case", async () => {
    // Distinct base64 digests can differ only in case, so the hex path's
    // case-insensitive compare would accept a signature it did not compute.
    const secret = "s3cret";
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => ({
        verify: { scheme: "hmac", secret, encoding: "base64" },
      }),
      onRequest: () => ({ status: 202 }),
    });
    const { token } = await endpoints.endpointFor("doc-1");
    const body = '{"a":1}';
    const digest = createHmac("sha256", secret).update(body).digest("base64");

    const send = (signature: string) =>
      fetch(`${url}/webhooks/${token}`, {
        method: "POST",
        headers: { "x-signature": signature },
        body,
      });

    expect((await send(digest)).status).toBe(202);
    expect((await send(digest.toLowerCase())).status).toBe(401);
  });

  it("accepts a prefixed layout carrying no label at all", async () => {
    // `prefix: ""` differs from unset, which means the algorithm's own label;
    // a sender using this layout bare needs a way to say so.
    const secret = "s3cret";
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => ({
        verify: { scheme: "hmac-prefixed", secret, prefix: "" },
      }),
      onRequest: () => ({ status: 202 }),
    });
    const { token } = await endpoints.endpointFor("doc-1");
    const body = "{}";
    const digest = createHmac("sha256", secret).update(body).digest("hex");

    const res = await fetch(`${url}/webhooks/${token}`, {
      method: "POST",
      headers: { "x-hub-signature-256": digest },
      body,
    });

    expect(res.status).toBe(202);
  });

  it("verifies a timestamped digest under an overridden algorithm", async () => {
    const secret = "s3cret";
    const handler = vi.fn(() => ({ status: 202 }));
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => ({
        verify: { scheme: "hmac-timestamped", secret, algorithm: "sha512" },
      }),
      onRequest: handler,
    });
    const { token } = await endpoints.endpointFor("doc-1");
    const body = "{}";
    const now = Math.floor(Date.now() / 1000);
    const digest = createHmac("sha512", secret)
      .update(`${now}.${body}`)
      .digest("hex");

    const res = await fetch(`${url}/webhooks/${token}`, {
      method: "POST",
      headers: { "stripe-signature": `t=${now},v1=${digest}` },
      body,
    });

    expect(res.status).toBe(202);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("refuses a timestamped signature outside the replay window", async () => {
    const secret = "s3cret";
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => ({
        verify: {
          scheme: "hmac-timestamped",
          secret,
          toleranceSeconds: 1,
        },
      }),
      onRequest: () => ({ status: 202 }),
    });
    const { token } = await endpoints.endpointFor("doc-1");

    const body = "{}";
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const signature = createHmac("sha256", secret)
      .update(`${stale}.${body}`)
      .digest("hex");

    const res = await fetch(`${url}/webhooks/${token}`, {
      method: "POST",
      headers: { "stripe-signature": `t=${stale},v1=${signature}` },
      body,
    });

    expect(res.status).toBe(401);
  });

  // ── provider behaviours ──────────────────────────────────────────────────

  it("echoes a challenge without invoking the handler", async () => {
    const handler = vi.fn(() => ({ status: 202 }));
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      defaults: { challengeField: "challenge" },
      onRequest: handler,
    });
    const { token } = await endpoints.endpointFor("doc-1");

    const res = await fetch(`${url}/webhooks/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challenge: "prove-it" }),
    });

    expect(await res.text()).toBe("prove-it");
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs a redelivered request once", async () => {
    const handler = vi.fn(() => ({ status: 202 }));
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      defaults: { dedupe: { field: "delivery_id" } },
      onRequest: handler,
    });
    const { token } = await endpoints.endpointFor("doc-1");

    const send = () =>
      fetch(`${url}/webhooks/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ delivery_id: "abc" }),
      });

    expect((await send()).status).toBe(202);
    // A retry answers as though it worked, so the provider stops retrying.
    expect((await send()).status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("refuses a method the registration did not allow", async () => {
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      defaults: { methods: ["POST"] },
      onRequest: () => ({ status: 202 }),
    });
    const { token } = await endpoints.endpointFor("doc-1");

    expect((await fetch(`${url}/webhooks/${token}`)).status).toBe(405);
  });

  it("redacts credentials from the headers the handler sees", async () => {
    let headers: Record<string, string> = {};
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      policyFor: () => ({ verify: { scheme: "token", secret: "open-sesame" } }),
      onRequest: (request) => {
        headers = request.headers;
        return { status: 202 };
      },
    });
    const { token } = await endpoints.endpointFor("doc-1");

    await fetch(`${url}/webhooks/${token}`, {
      method: "POST",
      headers: {
        "x-webhook-token": "open-sesame",
        authorization: "Bearer nope",
        "x-safe": "kept",
      },
      body: "{}",
    });

    expect(headers["x-webhook-token"]).toBe("[redacted]");
    expect(headers.authorization).toBe("[redacted]");
    expect(headers["x-safe"]).toBe("kept");
  });

  it("refuses a payload past the configured cap", async () => {
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      defaults: { maxBodyBytes: 16 },
      onRequest: () => ({ status: 202 }),
    });
    const { token } = await endpoints.endpointFor("doc-1");

    const res = await fetch(`${url}/webhooks/${token}`, {
      method: "POST",
      body: "x".repeat(1024),
    });
    expect(res.status).toBe(413);
  });

  // ── lifecycle ────────────────────────────────────────────────────────────

  it("answers 503 while the owning package is not loaded", async () => {
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      onRequest: () => ({ status: 202 }),
    });
    const { token } = await endpoints.endpointFor("doc-1");

    routes.disposeScope("@powerhousedao/workflow");

    // The token stays valid — a redeploy must not force re-registration with
    // every provider — but nothing on this host can serve it yet.
    const res = await fetch(`${url}/webhooks/${token}`, { method: "POST" });
    expect(res.status).toBe(503);
  });

  it("keeps the same token after the package re-registers", async () => {
    const first = await scope().webhooks.register({
      name: "trigger",
      onRequest: () => ({ status: 202 }),
    });
    const before = await first.endpointFor("doc-1");

    routes.disposeScope("@powerhousedao/workflow");

    const again = await scope().webhooks.register({
      name: "trigger",
      onRequest: () => ({ status: 200, body: "back" }),
    });
    const after = await again.endpointFor("doc-1");

    expect(after.token).toBe(before.token);
    const res = await fetch(`${url}/webhooks/${after.token}`, {
      method: "POST",
    });
    expect(await res.text()).toBe("back");
  });

  it("lists and revokes endpoints", async () => {
    const endpoints = await scope().webhooks.register({
      name: "trigger",
      onRequest: () => ({ status: 202 }),
    });
    await endpoints.endpointFor("doc-1");
    await endpoints.endpointFor("doc-2");

    expect((await endpoints.list()).map((e) => e.key).sort()).toEqual([
      "doc-1",
      "doc-2",
    ]);

    await endpoints.revoke("doc-1");
    expect((await endpoints.list()).map((e) => e.key)).toEqual(["doc-2"]);
  });

  // One round trip over the reactor's real store; the in-memory tests above
  // cannot show HTTP and database agree, and a mis-read dedupe drops every run.
  describe("over the relational store", () => {
    it("verifies, dedupes and delivers", async () => {
      const { db } = getDbClient();
      const relational = new WebhookService({
        store: new RelationalWebhookStore(
          createRelationalDb(db as unknown as Kysely<unknown>) as IRelationalDb,
        ),
        basePath: "/relational",
      });
      const relationalRoutes = new HttpRouteService({
        httpAdapter: adapter,
        webhooks: relational,
      });
      relational.attach(
        relationalRoutes.hostScope(
          "@powerhousedao/reactor-api",
          "/relational/webhooks",
        ),
      );

      const secret = "s3cret";
      const handler = vi.fn(() => ({ status: 202 }));
      const endpoints = await relationalRoutes
        .scopeFor("@acme/relational")
        .webhooks.register({
          name: "trigger",
          policyFor: () => ({
            verify: { scheme: "hmac-prefixed", secret },
            dedupe: { field: "delivery_id" },
          }),
          onRequest: handler,
        });

      const { token } = await endpoints.endpointFor("doc-1");
      const body = JSON.stringify({ delivery_id: "abc" });
      const send = () =>
        fetch(`${url}/relational/webhooks/${token}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-hub-signature-256": `sha256=${createHmac("sha256", secret)
              .update(body)
              .digest("hex")}`,
          },
          body,
        });

      expect((await send()).status).toBe(202);
      // The retry a provider would send after a timeout.
      expect((await send()).status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();

      const unsigned = await fetch(`${url}/relational/webhooks/${token}`, {
        method: "POST",
        body,
      });
      expect(unsigned.status).toBe(401);
    });
  });
});
