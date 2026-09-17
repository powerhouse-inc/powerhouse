// The signature-verifying half of core#webhook, over a real socket: config,
// resolved policy and the reactor's verifier have to agree on the wire format.
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  SECRET,
  SECRET_REF,
  startWebhookHost,
  waitForRuns,
  type WebhookHost,
} from "./harness.js";

type Algorithm = "sha1" | "sha256" | "sha512";
type Encoding = "hex" | "base64";

// Computed, never pasted: a hard-coded digest would still match after a change
// to what gets signed, which is what these tests exist to catch.
function digestOf(
  body: string,
  options: { algorithm?: Algorithm; encoding?: Encoding } = {},
): string {
  return createHmac(options.algorithm ?? "sha256", SECRET)
    .update(body)
    .digest(options.encoding ?? "hex");
}

const JSON_HEADERS = { "content-type": "application/json" };

let host: WebhookHost | undefined;

// Unconditional, and tolerant of a test that failed before arming: a host left
// listening leaks its port and handles into the rest of the suite.
afterEach(async () => {
  await host?.stop();
  host = undefined;
});

// A delivery is answered before the run starts, so a rejection and a delayed
// acceptance are indistinguishable until the bounded wait has passed.
async function expectNoRun(current: WebhookHost): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(current.fired).toHaveLength(0);
}

describe("core#webhook signature verification", () => {
  describe("the three layouts", () => {
    it("accepts a bare digest under hmac and starts a run", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac",
        secretRef: SECRET_REF,
        methods: "POST",
      });
      const body = '{"id":"evt_1"}';

      const res = await host.deliver(token, {
        headers: { ...JSON_HEADERS, "x-signature": digestOf(body) },
        body,
      });

      expect(res.status).toBe(202);
      const [run] = await waitForRuns(host, 1);
      expect(run.payload).toMatchObject({ body: { id: "evt_1" } });
    });

    it("refuses a wrong digest under hmac", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac",
        secretRef: SECRET_REF,
        methods: "POST",
      });

      const res = await host.deliver(token, {
        headers: { ...JSON_HEADERS, "x-signature": digestOf('{"id":"other"}') },
        body: '{"id":"evt_1"}',
      });

      expect(res.status).toBe(401);
      await expectNoRun(host);
    });

    it("accepts a labelled digest under hmac-prefixed and starts a run", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac-prefixed",
        secretRef: SECRET_REF,
        methods: "POST",
      });
      const body = '{"a":1}';

      const res = await host.deliver(token, {
        headers: {
          ...JSON_HEADERS,
          "x-hub-signature-256": `sha256=${digestOf(body)}`,
        },
        body,
      });

      expect(res.status).toBe(202);
      await waitForRuns(host, 1);
    });

    it("refuses a correct digest carrying the wrong label", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac-prefixed",
        secretRef: SECRET_REF,
        methods: "POST",
      });
      const body = '{"a":1}';

      const res = await host.deliver(token, {
        headers: {
          ...JSON_HEADERS,
          "x-hub-signature-256": `sha1=${digestOf(body)}`,
        },
        body,
      });

      expect(res.status).toBe(401);
      await expectNoRun(host);
    });

    it("accepts t=/v1= under hmac-timestamped and starts a run", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac-timestamped",
        secretRef: SECRET_REF,
        methods: "POST",
      });
      const body = '{"id":"evt_2"}';
      const t = Math.floor(Date.now() / 1000);

      const res = await host.deliver(token, {
        headers: {
          ...JSON_HEADERS,
          "stripe-signature": `t=${t},v1=${digestOf(`${t}.${body}`)}`,
        },
        body,
      });

      expect(res.status).toBe(202);
      await waitForRuns(host, 1);
    });

    it("refuses a timestamped digest signed without the timestamp", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac-timestamped",
        secretRef: SECRET_REF,
        methods: "POST",
      });
      const body = '{"id":"evt_2"}';
      const t = Math.floor(Date.now() / 1000);

      // The digest has to cover `<t>.<body>`; over the body alone a captured
      // signature would stay valid under any timestamp.
      const res = await host.deliver(token, {
        headers: {
          ...JSON_HEADERS,
          "stripe-signature": `t=${t},v1=${digestOf(body)}`,
        },
        body,
      });

      expect(res.status).toBe(401);
      await expectNoRun(host);
    });
  });

  it("verifies the exact bytes received, not a re-encoding of them", async () => {
    host = await startWebhookHost();
    const { token } = await host.arm({
      scheme: "hmac",
      secretRef: SECRET_REF,
      methods: "POST",
    });
    // Deliberately not canonical JSON — unsorted keys, a double space. Anyone
    // parsing and re-encoding the body before hashing breaks this delivery.
    const body = '{"b":1,  "a":2}';

    const res = await host.deliver(token, {
      headers: { ...JSON_HEADERS, "x-signature": digestOf(body) },
      body,
    });

    expect(res.status).toBe(202);
    await waitForRuns(host, 1);
  });

  describe("algorithm", () => {
    it("verifies a sha1 digest when the config names sha1", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac",
        secretRef: SECRET_REF,
        algorithm: "sha1",
        methods: "POST",
      });
      const body = '{"a":1}';

      const res = await host.deliver(token, {
        headers: {
          ...JSON_HEADERS,
          "x-signature": digestOf(body, { algorithm: "sha1" }),
        },
        body,
      });

      expect(res.status).toBe(202);
      await waitForRuns(host, 1);
    });

    it("verifies a sha512 digest when the config names sha512", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac",
        secretRef: SECRET_REF,
        algorithm: "sha512",
        methods: "POST",
      });
      const body = '{"a":1}';

      const res = await host.deliver(token, {
        headers: {
          ...JSON_HEADERS,
          "x-signature": digestOf(body, { algorithm: "sha512" }),
        },
        body,
      });

      expect(res.status).toBe(202);
      await waitForRuns(host, 1);
    });

    it("refuses a sha256 digest once the config names sha1", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac",
        secretRef: SECRET_REF,
        algorithm: "sha1",
        methods: "POST",
      });
      const body = '{"a":1}';

      const res = await host.deliver(token, {
        headers: { ...JSON_HEADERS, "x-signature": digestOf(body) },
        body,
      });

      expect(res.status).toBe(401);
      await expectNoRun(host);
    });

    it("takes the prefixed label from the algorithm when no prefix is set", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac-prefixed",
        secretRef: SECRET_REF,
        algorithm: "sha1",
        methods: "POST",
      });
      const body = '{"a":1}';
      const digest = digestOf(body, { algorithm: "sha1" });

      // `sha1=`, not the layout's `sha256=` default: the label follows the
      // hash, so switching algorithm alone still matches a sha1 sender.
      const accepted = await host.deliver(token, {
        headers: { ...JSON_HEADERS, "x-hub-signature-256": `sha1=${digest}` },
        body,
      });
      expect(accepted.status).toBe(202);
      await waitForRuns(host, 1);

      const refused = await host.deliver(token, {
        headers: { ...JSON_HEADERS, "x-hub-signature-256": `sha256=${digest}` },
        body,
      });
      expect(refused.status).toBe(401);
    });
  });

  describe("encoding", () => {
    it("verifies a base64 digest when the config names base64", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac",
        secretRef: SECRET_REF,
        encoding: "base64",
        methods: "POST",
      });
      const body = '{"a":1}';

      const res = await host.deliver(token, {
        headers: {
          ...JSON_HEADERS,
          "x-signature": digestOf(body, { encoding: "base64" }),
        },
        body,
      });

      expect(res.status).toBe(202);
      await waitForRuns(host, 1);
    });

    it("refuses a lower-cased base64 signature", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac",
        secretRef: SECRET_REF,
        encoding: "base64",
        methods: "POST",
      });
      const body = '{"a":1}';
      const digest = digestOf(body, { encoding: "base64" });
      // Guards the case itself: an all-lower-case digest would make the
      // assertion below prove nothing.
      expect(digest).not.toBe(digest.toLowerCase());

      const res = await host.deliver(token, {
        headers: { ...JSON_HEADERS, "x-signature": digest.toLowerCase() },
        body,
      });

      // Case is data in base64 — `a` and `A` are different six-bit groups — so
      // folding it would accept a signature nobody computed.
      expect(res.status).toBe(401);
      await expectNoRun(host);
    });

    it("accepts an upper-cased hex signature", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac",
        secretRef: SECRET_REF,
        methods: "POST",
      });
      const body = '{"a":1}';

      // Hex has one value per digit whatever the case, and senders disagree on
      // which they emit: rejecting these buys nothing and breaks integrations.
      const res = await host.deliver(token, {
        headers: {
          ...JSON_HEADERS,
          "x-signature": digestOf(body).toUpperCase(),
        },
        body,
      });

      expect(res.status).toBe(202);
      await waitForRuns(host, 1);
    });
  });

  describe("prefix", () => {
    it("matches a custom label", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac-prefixed",
        secretRef: SECRET_REF,
        prefix: "signature=",
        methods: "POST",
      });
      const body = '{"a":1}';

      const res = await host.deliver(token, {
        headers: {
          ...JSON_HEADERS,
          "x-hub-signature-256": `signature=${digestOf(body)}`,
        },
        body,
      });

      expect(res.status).toBe(202);
      await waitForRuns(host, 1);
    });

    it('reads an empty prefix as "no label", unlike omitting it', async () => {
      host = await startWebhookHost();
      const body = '{"a":1}';
      const digest = digestOf(body);

      const empty = await host.arm({
        scheme: "hmac-prefixed",
        secretRef: SECRET_REF,
        prefix: "",
        methods: "POST",
      });
      const accepted = await host.deliver(empty.token, {
        headers: { ...JSON_HEADERS, "x-hub-signature-256": digest },
        body,
      });
      expect(accepted.status).toBe(202);
      await waitForRuns(host, 1);

      // Re-armed without the field: omitted means "the algorithm's own label",
      // so the same bare digest now fails. "" is a value, not an absence.
      const omitted = await host.arm({
        scheme: "hmac-prefixed",
        secretRef: SECRET_REF,
        methods: "POST",
      });
      const refused = await host.deliver(omitted.token, {
        headers: { ...JSON_HEADERS, "x-hub-signature-256": digest },
        body,
      });
      expect(refused.status).toBe(401);
      await expectNoRun(host);
    });
  });

  describe("hmac-timestamped replay window", () => {
    it("refuses a timestamp outside the tolerance", async () => {
      host = await startWebhookHost();
      // Seconds rather than the 300s default: the window is what is under
      // test, and a stale timestamp is cheaper to fabricate than to wait for.
      const { token } = await host.arm({
        scheme: "hmac-timestamped",
        secretRef: SECRET_REF,
        toleranceSeconds: 2,
        methods: "POST",
      });
      const body = '{"id":"evt_3"}';
      const stale = Math.floor(Date.now() / 1000) - 60;

      const res = await host.deliver(token, {
        headers: {
          ...JSON_HEADERS,
          "stripe-signature": `t=${stale},v1=${digestOf(`${stale}.${body}`)}`,
        },
        body,
      });

      expect(res.status).toBe(401);
      await expectNoRun(host);
    });

    it("accepts a fresh timestamp under the same tolerance", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac-timestamped",
        secretRef: SECRET_REF,
        toleranceSeconds: 2,
        methods: "POST",
      });
      const body = '{"id":"evt_3"}';
      const t = Math.floor(Date.now() / 1000);

      const res = await host.deliver(token, {
        headers: {
          ...JSON_HEADERS,
          "stripe-signature": `t=${t},v1=${digestOf(`${t}.${body}`)}`,
        },
        body,
      });

      expect(res.status).toBe(202);
      await waitForRuns(host, 1);
    });

    it("accepts a header where only one of several v1 values matches", async () => {
      host = await startWebhookHost();
      const { token } = await host.arm({
        scheme: "hmac-timestamped",
        secretRef: SECRET_REF,
        methods: "POST",
      });
      const body = '{"id":"evt_4"}';
      const t = Math.floor(Date.now() / 1000);
      const rotated = createHmac("sha256", "previous-secret")
        .update(`${t}.${body}`)
        .digest("hex");

      // What a rotation looks like on the wire: the provider signs with the old
      // and the new secret at once, so requiring all to match is an outage.
      const res = await host.deliver(token, {
        headers: {
          ...JSON_HEADERS,
          "stripe-signature": `t=${t},v1=${rotated},v1=${digestOf(`${t}.${body}`)}`,
        },
        body,
      });

      expect(res.status).toBe(202);
      await waitForRuns(host, 1);
    });
  });

  it("refuses every delivery when the secret ref resolves to nothing", async () => {
    host = await startWebhookHost();
    // The tempting failure mode is a verify block with no secret in it reading
    // as "nothing to check": an unresolvable ref would then disarm the check.
    const { token } = await host.arm({
      scheme: "hmac",
      secretRef: "secret://v1:ffffffffffffffffffffffffffffffff",
      methods: "POST",
    });
    const body = '{"a":1}';

    const res = await host.deliver(token, {
      headers: { ...JSON_HEADERS, "x-signature": digestOf(body) },
      body,
    });

    expect(res.status).toBe(401);
    await expectNoRun(host);
  });
});
