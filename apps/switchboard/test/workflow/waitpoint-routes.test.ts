// The resume URL over a real socket: GET never resumes, the confirm page
// escapes what it shows, and POST hands the request to the runtime.
import {
  createHttpAdapter,
  HttpRouteService,
} from "@powerhousedao/reactor-api";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  MAX_REASON_LENGTH,
  registerWaitpointRoutes,
  waitpointBaseUrlOf,
  type WaitpointRouteRuntime,
} from "../../src/workflow/waitpoint-routes.js";

const TOKEN = "tok_abc";

describe("the waitpoint resume routes", () => {
  let base: string;
  let close: () => Promise<void>;
  const runtime = {
    describeWaitpointByToken:
      vi.fn<WaitpointRouteRuntime["describeWaitpointByToken"]>(),
    resumeWaitpointByToken:
      vi.fn<WaitpointRouteRuntime["resumeWaitpointByToken"]>(),
    resumeWaitpointByTokenSync:
      vi.fn<WaitpointRouteRuntime["resumeWaitpointByTokenSync"]>(),
  };

  beforeAll(async () => {
    const { adapter } = await createHttpAdapter("express");
    adapter.setupMiddleware({});
    const server = await adapter.listen(0, undefined, "127.0.0.1");
    const { port } = server.address() as { port: number };
    const url = `http://127.0.0.1:${port}`;
    const routes = new HttpRouteService({
      httpAdapter: adapter,
      publicUrl: url,
    });
    const scope = routes.scopeFor("@powerhousedao/workflow");
    registerWaitpointRoutes(scope, runtime);
    base = `${waitpointBaseUrlOf(scope)!}/${TOKEN}`;
    close = () => new Promise((done) => server.close(() => done()));
  });

  afterAll(() => close());

  beforeEach(() => {
    runtime.describeWaitpointByToken.mockReset().mockResolvedValue({
      workflowName: "Invoice <b>approval</b>",
      stepName: `Ask "finance"`,
      status: "PENDING",
      waitingSince: "2026-10-28T09:30:00.000Z",
    });
    runtime.resumeWaitpointByToken
      .mockReset()
      .mockResolvedValue({ status: "resumed" });
    runtime.resumeWaitpointByTokenSync.mockReset().mockResolvedValue({
      status: "resumed",
      reply: {
        status: 201,
        contentType: "application/json",
        body: '{"ok":true}',
        headers: { "x-next": "later" },
      },
    });
  });

  const form = (action: string, reason = "", accept = "text/html") =>
    fetch(`${base}/confirm?action=${action}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept,
      },
      body: new URLSearchParams({ reason }).toString(),
    });

  it("lives under the workflow package's namespace", () => {
    expect(base).toMatch(
      /\/api\/@powerhousedao\/workflow\/waitpoints\/tok_abc$/,
    );
  });

  it("serves no resume URL from a host with no public origin", async () => {
    const { adapter } = await createHttpAdapter("express");
    const routes = new HttpRouteService({ httpAdapter: adapter });
    const scope = routes.scopeFor("@powerhousedao/workflow");
    expect(scope.baseUrl).toMatch(/^\/api\//);
    expect(waitpointBaseUrlOf(scope)).toBeUndefined();
  });

  // The bare URL's page posts to /confirm, relative to the token.
  it.each([
    [
      "GET",
      "?action=approve",
      200,
      'formaction="tok_abc/confirm?action=approve"',
    ],
    ["GET", "/sync", 405, undefined],
    ["GET", "/confirm", 200, "<form"],
    ["HEAD", "", 200, ""],
    ["HEAD", "/sync", 405, ""],
    ["HEAD", "/confirm", 200, ""],
  ] as const)(
    "never resumes on %s %s, answering %i",
    async (method, path, status, body) => {
      const response = await fetch(`${base}${path}`, { method });
      expect(response.status).toBe(status);
      if (status === 405) expect(response.headers.get("allow")).toBe("POST");
      const text = await response.text();
      if (body === "") expect(text).toBe("");
      else if (body) expect(text).toContain(body);
      expect(runtime.resumeWaitpointByToken).not.toHaveBeenCalled();
      expect(runtime.resumeWaitpointByTokenSync).not.toHaveBeenCalled();
    },
  );

  it("serves an escaped confirm page under a strict CSP", async () => {
    const response = await fetch(`${base}/confirm?x=1`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const body = await response.text();
    expect(runtime.describeWaitpointByToken).toHaveBeenCalledWith(TOKEN);
    expect(body).toContain("Invoice &lt;b&gt;approval&lt;/b&gt;");
    expect(body).toContain("Ask &quot;finance&quot;");
    expect(body).not.toContain("<b>");
    expect(body).not.toContain("<script");
    expect(body).toContain('formaction="?x=1&amp;action=approve"');
    expect(body).toContain('formaction="?x=1&amp;action=disapprove"');
  });

  it("describes the workflow and the wait, times in UTC", async () => {
    runtime.describeWaitpointByToken.mockResolvedValueOnce({
      workflowName: "Vendor sign-off",
      workflowDescription: "Ask <the vendor> to sign off\non the new terms.",
      stepName: "Ask vendor",
      actionName: "Create Approval Links",
      status: "PENDING",
      startedAt: "2026-10-28T09:29:00.000Z",
      triggerName: "Manual Trigger",
      waitingSince: "2026-10-28T09:30:00.000Z",
      expiresAt: "2026-11-04T09:30:00.000Z",
    });
    const body = await (await fetch(`${base}/confirm`)).text();
    expect(body).toContain(
      "Ask &lt;the vendor&gt; to sign off\non the new terms.",
    );
    expect(body).toContain("<dd>Ask vendor · Create Approval Links</dd>");
    expect(body).toContain(
      "<dd>28 Oct 2026, 09:29 UTC, by Manual Trigger</dd>",
    );
    expect(body).toContain(
      "<dt>Waiting since</dt><dd>28 Oct 2026, 09:30 UTC</dd>",
    );
    expect(body).toContain("<dt>Expires</dt><dd>4 Nov 2026, 09:30 UTC</dd>");
  });

  it("names the action only when the step's own name differs", async () => {
    runtime.describeWaitpointByToken.mockResolvedValueOnce({
      workflowName: "wf",
      stepName: "Create approval links",
      actionName: "Create Approval Links",
      status: "PENDING",
      waitingSince: "2026-10-28T09:30:00.000Z",
    });
    const body = await (await fetch(`${base}/confirm`)).text();
    expect(body).toContain("<dd>Create approval links</dd>");
  });

  it.each([
    ["COMPLETED", "Already responded"],
    ["CONSUMED", "Already responded"],
    ["EXPIRED", "Request expired"],
    ["CANCELLED", "Run cancelled"],
  ] as const)("shows a %s waitpoint without a form", async (status, title) => {
    runtime.describeWaitpointByToken.mockResolvedValueOnce({
      workflowName: "wf",
      stepName: "step",
      status,
      waitingSince: "2026-10-28T09:30:00.000Z",
    });
    const body = await (await fetch(`${base}/confirm`)).text();
    expect(body).toContain(title);
    expect(body).not.toContain("<form");
  });

  it("answers 404 for a token the runtime does not know", async () => {
    runtime.describeWaitpointByToken.mockResolvedValueOnce(undefined);
    expect((await fetch(`${base}/confirm`)).status).toBe(404);
  });

  it("resumes on POST with body, headers and query, answering JSON", async () => {
    const response = await fetch(`${base}?a=1`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
      body: JSON.stringify({ ok: true }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "resumed" });
    const [token, payload] = runtime.resumeWaitpointByToken.mock.calls[0]!;
    expect(token).toBe(TOKEN);
    expect(payload.body).toEqual({ ok: true });
    expect(payload.queryParams).toEqual({ a: "1" });
    expect(payload.headers?.["content-type"]).toBe("application/json");
    // Credentials are not journaled with the payload.
    expect(payload.headers?.authorization).toBeUndefined();
  });

  it("answers the sync sub-path with the resumed run's reply", async () => {
    const response = await fetch(`${base}/sync`, { method: "POST" });
    expect(runtime.resumeWaitpointByTokenSync).toHaveBeenCalledOnce();
    expect(runtime.resumeWaitpointByToken).not.toHaveBeenCalled();
    expect(response.status).toBe(201);
    expect(response.headers.get("x-next")).toBe("later");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("answers a gone waitpoint on the sync sub-path with 410", async () => {
    runtime.resumeWaitpointByTokenSync.mockResolvedValue({ status: "gone" });
    const response = await fetch(`${base}/sync`, { method: "POST" });
    expect(response.status).toBe(410);
  });

  it("answers the confirm form with an HTML page", async () => {
    const response = await form("disapprove", "too expensive");
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("You disapproved this request.");
    const [, payload] = runtime.resumeWaitpointByToken.mock.calls[0]!;
    expect(payload.body).toEqual({ reason: "too expensive" });
    expect(payload.queryParams).toEqual({
      action: "disapprove",
      reason: "too expensive",
    });
  });

  it("refuses a confirm POST without an action, recording nothing", async () => {
    expect((await form("maybe")).status).toBe(400);
    expect(runtime.resumeWaitpointByToken).not.toHaveBeenCalled();
  });

  it("refuses an over-long reason, recording nothing", async () => {
    const response = await form("approve", "x".repeat(MAX_REASON_LENGTH + 1));
    expect(response.status).toBe(400);
    expect(runtime.resumeWaitpointByToken).not.toHaveBeenCalled();
  });

  it("refuses a body past 1 MiB", async () => {
    const response = await fetch(base, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "x".repeat(1_048_577),
    });
    expect(response.status).toBe(413);
    expect(runtime.resumeWaitpointByToken).not.toHaveBeenCalled();
  });

  it("answers a repeat as already responded and a gone waitpoint as 410", async () => {
    runtime.resumeWaitpointByToken.mockResolvedValueOnce({ status: "already" });
    const already = await form("approve");
    expect(already.status).toBe(200);
    expect(await already.text()).toContain("Already responded");

    runtime.resumeWaitpointByToken.mockResolvedValueOnce({ status: "gone" });
    const gone = await fetch(base, { method: "POST" });
    expect(gone.status).toBe(410);
    expect(await gone.json()).toMatchObject({ status: "gone" });
  });
});
