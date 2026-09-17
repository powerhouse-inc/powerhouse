// Redelivery and the sender's verification round, over a real socket: both
// are decided by the reactor from one config field, before the trigger runs.
import { afterEach, describe, expect, it } from "vitest";
import { startWebhookHost, waitForRuns, type WebhookHost } from "./harness.js";

let host: WebhookHost | undefined;

afterEach(async () => {
  // Even on failure: a thrown expectation would leave the port open.
  await host?.stop();
  host = undefined;
});

const JSON_HEADERS = { "content-type": "application/json" };

// Gives a run that should NOT exist time to appear: asserting the instant a
// response lands wins the race whether the trigger fired or not.
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

interface PolicyShape {
  dedupe?: { field: unknown; ttlSeconds?: number };
  challengeField?: unknown;
}

describe("core#webhook redelivery", () => {
  it("dedupes on a bare field name found in the query string", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({
      methods: "POST",
      dedupeField: "eventId",
      dedupeTtlSeconds: 60,
    });
    const send = () => host!.deliver(token, { query: { eventId: "evt-1" } });

    expect((await send()).status).toBe(202);
    await waitForRuns(host, 1);
    // A redelivery is answered as a success so the provider stops retrying;
    // 4xx here would make a well-behaved sender retry forever.
    expect((await send()).status).toBe(200);
    await settle();
    expect(host.fired).toHaveLength(1);
  });

  it("dedupes on a bare field name found as a top-level body field", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({
      methods: "POST",
      dedupeField: "id",
      dedupeTtlSeconds: 60,
    });
    const send = () =>
      host!.deliver(token, {
        headers: JSON_HEADERS,
        body: '{"id":"evt_1","kind":"created"}',
      });

    expect((await send()).status).toBe(202);
    await waitForRuns(host, 1);
    expect((await send()).status).toBe(200);
    await settle();
    expect(host.fired).toHaveLength(1);
  });

  it("dedupes on a `header:`-sourced field", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({
      methods: "POST",
      dedupeField: "header:x-delivery-id",
      dedupeTtlSeconds: 60,
    });
    const send = () =>
      host!.deliver(token, {
        headers: { ...JSON_HEADERS, "x-delivery-id": "abc-123" },
        body: '{"a":1}',
      });

    expect((await send()).status).toBe(202);
    await waitForRuns(host, 1);
    expect((await send()).status).toBe(200);
    await settle();
    expect(host.fired).toHaveLength(1);
  });

  it("dedupes on a `body:` path nested inside the payload", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({
      methods: "POST",
      dedupeField: "body:data.object.id",
      dedupeTtlSeconds: 60,
    });
    const send = () =>
      host!.deliver(token, {
        headers: JSON_HEADERS,
        body: '{"data":{"object":{"id":"in_1"}}}',
      });

    expect((await send()).status).toBe(202);
    await waitForRuns(host, 1);
    expect((await send()).status).toBe(200);
    await settle();
    expect(host.fired).toHaveLength(1);
  });

  it("keys only on the named field, not on the URL or the body", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({
      methods: "POST",
      dedupeField: "header:x-delivery-id",
      dedupeTtlSeconds: 60,
    });

    const first = await host.deliver(token, {
      headers: { ...JSON_HEADERS, "x-delivery-id": "abc-123" },
      query: { attempt: "1" },
      body: '{"attempt":1}',
    });
    expect(first.status).toBe(202);
    await waitForRuns(host, 1);

    // A retry is rarely byte-identical, so anything keyed on the URL or the
    // whole request would treat this as a new event and run twice.
    const retry = await host.deliver(token, {
      headers: { ...JSON_HEADERS, "x-delivery-id": "abc-123" },
      query: { attempt: "2" },
      body: '{"attempt":2}',
    });
    expect(retry.status).toBe(200);
    await settle();
    expect(host.fired).toHaveLength(1);
  });

  it("starts a second run when the named field carries a different value", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({
      methods: "POST",
      dedupeField: "header:x-delivery-id",
      dedupeTtlSeconds: 60,
    });
    const send = (id: string) =>
      host!.deliver(token, {
        headers: { ...JSON_HEADERS, "x-delivery-id": id },
        body: '{"a":1}',
      });

    expect((await send("abc-123")).status).toBe(202);
    expect((await send("def-456")).status).toBe(202);
    await waitForRuns(host, 2);
    expect(host.fired).toHaveLength(2);
  });

  it("runs every delivery when no dedupe field is configured", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({ methods: "POST" });
    const send = () =>
      host!.deliver(token, { headers: JSON_HEADERS, body: '{"a":1}' });

    expect((await send()).status).toBe(202);
    expect((await send()).status).toBe(202);
    // Without an id there is no key, and collapsing unrelated deliveries under
    // a shared "no key" bucket would silently drop real events.
    await waitForRuns(host, 2);
    expect(host.fired).toHaveLength(2);
  });

  it("runs both deliveries when the configured field is absent from the request", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({
      methods: "POST",
      dedupeField: "header:x-delivery-id",
      dedupeTtlSeconds: 60,
    });
    const send = (body: string) =>
      host!.deliver(token, { headers: JSON_HEADERS, body });

    expect((await send('{"a":1}')).status).toBe(202);
    expect((await send('{"a":2}')).status).toBe(202);
    // A missing field is not a key either: two senders that both omit it are
    // not the same delivery, and treating them as one loses the second event.
    await waitForRuns(host, 2);
    expect(host.fired).toHaveLength(2);
  });

  it("drops everything after the first when the named field repeats across events", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({
      methods: "POST",
      // A subscription id is the same on every delivery for that subscription,
      // so naming it here is a configuration mistake with no error to see.
      dedupeField: "subscriptionId",
      dedupeTtlSeconds: 60,
    });
    const send = (eventId: string) =>
      host!.deliver(token, {
        headers: JSON_HEADERS,
        body: `{"subscriptionId":"sub_1","eventId":"${eventId}"}`,
      });

    expect((await send("evt_1")).status).toBe(202);
    await waitForRuns(host, 1);
    // Two different events, second silently discarded: the field has to
    // identify the delivery, not the thing it is about.
    expect((await send("evt_2")).status).toBe(200);
    await settle();
    expect(host.fired).toHaveLength(1);
  });
});

describe("core#webhook endpoint verification", () => {
  it("echoes a bare challenge field from the query string without running", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({
      methods: "POST",
      challengeField: "hub.challenge",
    });

    const response = await host.deliver(token, {
      query: { "hub.challenge": "nonce-42" },
    });
    expect(response.status).toBe(200);
    // Verbatim: providers compare the body byte for byte, so a JSON wrapper or
    // a trailing newline fails the subscription with nothing to read.
    expect(await response.text()).toBe("nonce-42");
    await settle();
    expect(host.fired).toHaveLength(0);
  });

  it("echoes a `header:`-sourced challenge field without running", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({
      methods: "POST",
      challengeField: "header:x-hook-challenge",
    });

    const response = await host.deliver(token, {
      headers: { ...JSON_HEADERS, "x-hook-challenge": "nonce-99" },
      body: '{"type":"url_verification"}',
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("nonce-99");
    await settle();
    expect(host.fired).toHaveLength(0);
  });

  it("runs as usual when the challenge field is absent", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({
      methods: "POST",
      challengeField: "hub.challenge",
    });

    // The challenge round happens once; every delivery after it is a real
    // event, so a configured challenge field must not swallow the endpoint.
    const response = await host.deliver(token, {
      headers: JSON_HEADERS,
      body: '{"id":"evt_1"}',
    });
    expect(response.status).toBe(202);
    const [run] = await waitForRuns(host, 1);
    expect(run.kind).toBe("webhook");
  });
});

describe("core#webhook field policy", () => {
  it("hands the reactor a source-tagged field for a prefixed config", async () => {
    host = await startWebhookHost();
    await host.arm({
      methods: "POST",
      dedupeField: "header:X-Delivery-ID",
      challengeField: "body:challenge.value",
      dedupeTtlSeconds: 60,
    });

    const policy = (await host.policyFor()) as PolicyShape;
    // Lowercased for the reactor's header record; the prefix must survive
    // parsing or the reactor reads the query string and finds no id.
    expect(policy.dedupe?.field).toEqual({ header: "x-delivery-id" });
    expect(policy.dedupe?.ttlSeconds).toBe(60);
    expect(policy.challengeField).toEqual({ body: "challenge.value" });
  });

  it("leaves a bare field name bare, so the reactor tries query then body", async () => {
    host = await startWebhookHost();
    await host.arm({
      methods: "POST",
      dedupeField: "eventId",
      challengeField: "hub.challenge",
    });

    const policy = (await host.policyFor()) as PolicyShape;
    expect(policy.dedupe?.field).toBe("eventId");
    expect(policy.challengeField).toBe("hub.challenge");
  });
});
