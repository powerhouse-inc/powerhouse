// The unverified and token halves of core#webhook, over a real socket. Only
// the status code a provider actually receives proves these gates are wired.
import { afterEach, describe, expect, it } from "vitest";
import {
  SECRET,
  SECRET_REF,
  startWebhookHost,
  waitForRuns,
  type FiredRun,
  type WebhookHost,
} from "./harness.js";

const JSON_BODY = { headers: { "content-type": "application/json" } };

let host: WebhookHost | undefined;

async function start(
  options: { fire?: (run: FiredRun) => unknown } = {},
): Promise<WebhookHost> {
  host = await startWebhookHost(options);
  return host;
}

// A delivery is answered before its run begins, so an immediate length check
// would pass even on a host that fires a moment later.
async function expectNoRuns(target: WebhookHost): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(target.fired).toHaveLength(0);
}

afterEach(async () => {
  // Unconditional: a failed assertion leaves the listener bound, and one
  // leaked socket per test eventually wedges the whole file.
  await host?.stop();
  host = undefined;
});

describe("core#webhook over HTTP: unverified", () => {
  it("starts one run carrying the request the provider sent", async () => {
    const webhook = await start();
    const { token } = await webhook.arm({ methods: "POST", scheme: "none" });

    const res = await webhook.deliver(token, {
      ...JSON_BODY,
      body: '{"a":1}',
      query: { source: "x" },
    });

    expect(res.status).toBe(202);
    const [run] = await waitForRuns(webhook, 1);
    expect(run.kind).toBe("webhook");
    expect(run.payload).toMatchObject({
      method: "POST",
      path: `/webhooks/${token}`,
      queryParams: { source: "x" },
      // Decoded, not the raw bytes: an authored expression reads `body.a`.
      body: { a: 1 },
      headers: { "content-type": "application/json" },
    });
  });

  it("does not start a second run for one delivery", async () => {
    // A stray retry or double-fire would duplicate the run without changing
    // the status the provider sees.
    const webhook = await start();
    const { token } = await webhook.arm({ scheme: "none" });

    const res = await webhook.deliver(token, { ...JSON_BODY, body: "{}" });
    expect(res.status).toBe(202);

    await waitForRuns(webhook, 1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(webhook.fired).toHaveLength(1);
  });
});

describe("core#webhook over HTTP: method restriction", () => {
  it("refuses every method the author did not allow", async () => {
    // A provider's verification round often probes with GET; the author asked
    // for POST only, so the probe must be refused rather than run anything.
    const webhook = await start();
    const { token } = await webhook.arm({ methods: "POST", scheme: "none" });

    const get = await webhook.deliver(token, { method: "GET" });
    const put = await webhook.deliver(token, {
      method: "PUT",
      ...JSON_BODY,
      body: "{}",
    });
    expect(get.status).toBe(405);
    expect(put.status).toBe(405);
    await expectNoRuns(webhook);

    const post = await webhook.deliver(token, { ...JSON_BODY, body: "{}" });
    expect(post.status).toBe(202);
    await waitForRuns(webhook, 1);
  });

  it('accepts every method when the author spelled it "ANY"', async () => {
    const webhook = await start();
    const { token } = await webhook.arm({ methods: "ANY", scheme: "none" });

    for (const method of ["GET", "POST", "DELETE"]) {
      const res = await webhook.deliver(token, { method });
      expect(res.status).toBe(202);
    }

    const runs = await waitForRuns(webhook, 3);
    expect(
      runs.map((run) => (run.payload as { method: string }).method),
    ).toEqual(["GET", "POST", "DELETE"]);
  });

  it("accepts every method when the author named none", async () => {
    // Omitting the field is how the editor spells "any"; read as an empty
    // allow-list it would refuse everything instead.
    const webhook = await start();
    const { token } = await webhook.arm({ scheme: "none" });

    const res = await webhook.deliver(token, { method: "PATCH" });
    expect(res.status).toBe(202);
    await waitForRuns(webhook, 1);
  });
});

describe("core#webhook over HTTP: token scheme", () => {
  const tokenConfig = { scheme: "token", secretRef: SECRET_REF };

  it("accepts a delivery presenting the shared secret", async () => {
    const webhook = await start();
    const { token } = await webhook.arm(tokenConfig);

    const res = await webhook.deliver(token, {
      headers: { ...JSON_BODY.headers, "x-webhook-token": SECRET },
      body: '{"id":"evt_1"}',
    });

    expect(res.status).toBe(202);
    const [run] = await waitForRuns(webhook, 1);
    // The credential must not survive into the run journal, where it would be
    // as readable as the payload.
    expect(run.payload).toMatchObject({
      headers: { "x-webhook-token": "[redacted]" },
    });
  });

  it("refuses a wrong token with 401 and runs nothing", async () => {
    const webhook = await start();
    const { token } = await webhook.arm(tokenConfig);

    const res = await webhook.deliver(token, {
      headers: { ...JSON_BODY.headers, "x-webhook-token": "not-the-secret" },
      body: "{}",
    });

    expect(res.status).toBe(401);
    await expectNoRuns(webhook);
  });

  it("refuses a delivery with no token at all", async () => {
    // Absent has to fail exactly as wrong does: omitting the header is the
    // cheapest possible probe.
    const webhook = await start();
    const { token } = await webhook.arm(tokenConfig);

    const res = await webhook.deliver(token, { ...JSON_BODY, body: "{}" });

    expect(res.status).toBe(401);
    await expectNoRuns(webhook);
  });

  it("reads the token from the header the author named", async () => {
    // Providers disagree about the header, so the default is only a default:
    // an override has to displace it, not be accepted alongside it.
    const webhook = await start();
    const { token } = await webhook.arm({ ...tokenConfig, header: "X-Auth" });

    const defaulted = await webhook.deliver(token, {
      headers: { ...JSON_BODY.headers, "x-webhook-token": SECRET },
      body: "{}",
    });
    expect(defaulted.status).toBe(401);
    await expectNoRuns(webhook);

    const res = await webhook.deliver(token, {
      headers: { ...JSON_BODY.headers, "x-auth": SECRET },
      body: "{}",
    });
    expect(res.status).toBe(202);
    await waitForRuns(webhook, 1);
  });
});

describe("core#webhook over HTTP: response modes", () => {
  it("answers async before the run has finished", async () => {
    // The point of async mode: the provider's socket is never held for as long
    // as the workflow takes, even for a run that never settles.
    const webhook = await start({
      fire: () =>
        new Promise(() => {
          /* never settles */
        }),
    });
    const { token } = await webhook.arm({ responseMode: "async" });

    const res = await webhook.deliver(token, { ...JSON_BODY, body: "{}" });

    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
    // Started, but still going: the answer above did not wait for it.
    await waitForRuns(webhook, 1);
  });

  it("answers async with the status the author chose", async () => {
    const webhook = await start();
    const { token } = await webhook.arm({
      responseMode: "async",
      responseStatus: 204,
    });

    const res = await webhook.deliver(token, { ...JSON_BODY, body: "{}" });
    expect(res.status).toBe(204);
    await waitForRuns(webhook, 1);
  });

  it("holds the socket in sync mode and reports the run outcome", async () => {
    let finished = false;
    const webhook = await start({
      fire: () =>
        new Promise((resolve) =>
          setTimeout(() => {
            finished = true;
            resolve({ runId: "run-slow", status: "SUCCEEDED", steps: [] });
          }, 50),
        ),
    });
    const { token } = await webhook.arm({ responseMode: "sync" });

    const res = await webhook.deliver(token, { ...JSON_BODY, body: "{}" });

    expect(res.status).toBe(200);
    // The outcome is in the answer, so the answer cannot predate the run.
    expect(finished).toBe(true);
    expect(res.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(await res.json()).toEqual({
      runId: "run-slow",
      status: "SUCCEEDED",
      error: null,
    });
  });

  it("answers sync with the status the author chose for a succeeding run", async () => {
    const webhook = await start();
    const { token } = await webhook.arm({
      responseMode: "sync",
      responseStatus: 201,
    });

    const res = await webhook.deliver(token, { ...JSON_BODY, body: "{}" });

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: "SUCCEEDED" });
  });

  it("answers 500 in sync mode when the run fails", async () => {
    // The author's status is for a success only: a provider that retries on
    // 5xx must not be told a failed run went through.
    const webhook = await start({
      fire: () => ({
        runId: "run-bad",
        status: "FAILED",
        error: "step blew up",
        steps: [],
      }),
    });
    const { token } = await webhook.arm({
      responseMode: "sync",
      responseStatus: 201,
    });

    const res = await webhook.deliver(token, { ...JSON_BODY, body: "{}" });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      runId: "run-bad",
      status: "FAILED",
      error: "step blew up",
    });
  });
});

describe("core#webhook over HTTP: endpoints that are not armed", () => {
  it("answers a disarmed endpoint exactly as an unknown one", async () => {
    // The endpoint row outlives disabling so re-enabling keeps the URL, which
    // is why the answer must not betray that the token is a real one.
    const webhook = await start();
    const { token } = await webhook.arm({ scheme: "none" });
    await webhook.disarm();

    const disarmed = await webhook.deliver(token, { ...JSON_BODY, body: "{}" });
    const unknown = await webhook.deliver("ffffffffffffffffffffffffffffffff", {
      ...JSON_BODY,
      body: "{}",
    });

    expect(disarmed.status).toBe(404);
    expect(unknown.status).toBe(disarmed.status);
    expect(await disarmed.text()).toBe(await unknown.text());
    await expectNoRuns(webhook);
  });

  it("refuses deliveries to an endpoint whose config does not parse", async () => {
    // A token scheme with no secretRef cannot be honoured; firing anyway would
    // run the workflow with no verification at all.
    const webhook = await start();
    const { token } = await webhook.arm({ scheme: "none" });
    // Re-published enabled but unparseable. The row minted above still makes
    // the token addressable, so this is the state a provider would hit.
    await webhook.arm({ scheme: "token" });

    expect(await webhook.policyFor()).toBeUndefined();
    const res = await webhook.deliver(token, {
      headers: { ...JSON_BODY.headers, "x-webhook-token": SECRET },
      body: "{}",
    });

    expect(res.status).toBe(404);
    await expectNoRuns(webhook);
  });
});
