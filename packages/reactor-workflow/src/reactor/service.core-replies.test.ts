// The core Stop run and Respond and wait for webhook blocks, through a real
// runtime: sync webhook replies, resume URLs, /sync resumes and expiry.
import { describe, expect, it } from "vitest";
import {
  armWebhook,
  BASE_URL,
  CORE,
  CTX,
  fire,
  json,
  latestRun,
  settles,
  stepsOf,
  tokenOf,
  waitpointSuite,
  webhookDelivery,
  type StepSpec,
} from "../../test/helpers/waitpoints.js";
import { configuredResponse, RESUME_URL_HEADER } from "../pieces/index.js";

const suite = waitpointSuite();

const manual = (id: string, steps: StepSpec[]) =>
  suite.define(id, steps, { piece: CORE });

const syncWebhook = (id: string, steps: StepSpec[]) =>
  armWebhook(suite.service, suite.documents, id, "sync", steps, {
    piece: CORE,
  });

const deliver = (id: string) =>
  suite.service.deliverWebhook(webhookDelivery(id));

describe("configuredResponse", () => {
  it("builds raw and redirect responses, and none from blank props", () => {
    expect(configuredResponse({ responseType: "json" }, "t")).toBeUndefined();
    expect(
      configuredResponse({ responseType: "raw", text: "hi", status: 418 }, "t"),
    ).toEqual({ status: 418, headers: {}, body: "hi" });
    expect(
      configuredResponse(
        { responseType: "redirect", redirectUrl: "example.com/next" },
        "t",
      ),
    ).toEqual({
      status: 302,
      headers: { location: "https://example.com/next" },
      body: "https://example.com/next",
    });
    expect(() => configuredResponse({ body: "{nope" }, "t")).toThrow(
      /not valid JSON/,
    );
  });
});

describe("Stop run", () => {
  it("answers a sync webhook with its response and skips the rest", async () => {
    await syncWebhook("wf-stop-reply", [
      [
        "stop",
        "stop",
        { status: 201, headers: { "X-Done": "yes" }, body: { done: true } },
      ],
      ["after", "assert", { value: "never" }],
    ]);
    const reply = await deliver("wf-stop-reply");
    expect(reply.status).toBe(201);
    expect(JSON.parse(reply.body!)).toEqual({ done: true });
    expect(reply.headers).toEqual({
      "x-done": "yes",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
    });
    const runId = await latestRun(suite.service, "wf-stop-reply");
    await settles(suite.service, runId, "SUCCEEDED");
    const after = (await stepsOf(suite.service, runId)).after;
    expect(after?.status ?? "SKIPPED").toBe("SKIPPED");
  });

  it("answers a sync webhook 200 with {} when no response is set", async () => {
    await syncWebhook("wf-stop-bare", [
      ["stop", "stop", { responseType: "json" }],
    ]);
    const reply = await deliver("wf-stop-bare");
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body!)).toEqual({});
  });
});

describe("Respond and wait for webhook", () => {
  it("answers the sync caller with a resume URL, and a POST to it resumes", async () => {
    await syncWebhook("wf-handshake", [
      ["wait", "waitForWebhook", { status: 202, body: { accepted: true } }],
      ["after", "assert", { value: "{{steps.wait.output.body.answer}}" }],
    ]);
    const reply = await deliver("wf-handshake");
    expect(reply.status).toBe(202);
    const body = JSON.parse(reply.body!) as {
      accepted: boolean;
      resumeUrl: string;
    };
    expect(body.accepted).toBe(true);
    expect(body.resumeUrl.startsWith(`${BASE_URL}/`)).toBe(true);
    expect(reply.headers?.[RESUME_URL_HEADER]).toBe(body.resumeUrl);

    const runId = await latestRun(suite.service, "wf-handshake");
    await settles(suite.service, runId, "WAITING");
    const [waitpoint] = await suite.service.waitpointsForRun(runId, CTX);
    expect(waitpoint).toMatchObject({ type: "WEBHOOK", kind: "webhook" });

    const resumed = await suite.service.resumeWaitpointByToken(
      tokenOf(body.resumeUrl),
      {
        body: { answer: "42" },
        headers: { "x-from": "caller" },
        queryParams: { q: "1" },
      },
    );
    expect(resumed.status).toBe("resumed");
    await settles(suite.service, runId, "SUCCEEDED");
    const journal = await stepsOf(suite.service, runId);
    expect(json(journal.wait!.output)).toEqual({
      body: { answer: "42" },
      headers: { "x-from": "caller" },
      queryParams: { q: "1" },
    });
    expect(json<{ value: string }>(journal.after!.output).value).toBe("42");
  });

  it("leaves resumeUrl out of the body when asked, keeping the header", async () => {
    await syncWebhook("wf-handshake-header", [
      ["wait", "waitForWebhook", { body: { ok: 1 }, includeResumeUrl: false }],
    ]);
    const reply = await deliver("wf-handshake-header");
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body!)).toEqual({ ok: 1 });
    expect(reply.headers?.[RESUME_URL_HEADER]).toMatch(/^https:\/\//);
  });

  it("resumes through /sync, answered by a later Stop run", async () => {
    manual("wf-handshake-sync", [
      ["wait", "waitForWebhook"],
      [
        "stop",
        "stop",
        { responseType: "raw", text: "got {{steps.wait.output.body.n}}" },
      ],
    ]);
    const fired = await fire(suite.service, "wf-handshake-sync");
    expect(fired.status).toBe("WAITING");
    const { resumeUrl } = json<{ resumeUrl: string }>(
      (await stepsOf(suite.service, fired.runId!)).wait!.output,
    );

    const { status, reply } = await suite.service.resumeWaitpointByTokenSync(
      tokenOf(resumeUrl),
      { body: { n: 7 }, queryParams: {} },
    );
    expect(status).toBe("resumed");
    expect(reply).toMatchObject({ status: 200, body: "got 7" });
    await settles(suite.service, fired.runId!, "SUCCEEDED");
  });

  // The poller's expiry itself runs end to end in Request approval's suite.
  it("expires after the configured time", async () => {
    manual("wf-handshake-expire", [
      ["wait", "waitForWebhook", { expiresAfter: 2, expiresUnit: "hours" }],
    ]);
    const fired = await fire(suite.service, "wf-handshake-expire");
    expect(fired.status).toBe("WAITING");
    const [waitpoint] = await suite.service.waitpointsForRun(fired.runId!, CTX);
    // Counted from the step's clock, a moment before the row's created_at.
    const expiresIn =
      Date.parse(waitpoint!.expiresAt!) - Date.parse(waitpoint!.createdAt);
    expect(Math.abs(expiresIn - 2 * 3_600_000)).toBeLessThan(1000);
  });

  it.each([
    ["no HTTP host", "nohost", undefined],
    ["a path-only base", "pathonly", "/api/workflow/waitpoints"],
  ])("fails on %s to serve the resume URL", async (_, name, baseUrl) => {
    const service = suite.runtime(undefined, { waitpointBaseUrl: baseUrl });
    const id = `wf-handshake-${name}`;
    manual(id, [["wait", "waitForWebhook"]]);
    const fired = await fire(service, id);
    expect(fired.status).toBe("FAILED");
    expect(fired.error).toMatch(/resume URLs need an HTTP host/);
  });
});
