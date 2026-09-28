// Config parsing for the core webhook trigger; verification, tokens,
// redaction, dedupe and rate limiting live in the reactor's webhook service.
import { describe, expect, it } from "vitest";
import { parseWebhookConfig } from "./webhook.js";

describe("parseWebhookConfig", () => {
  const REF = "secret://v1:00112233445566778899aabbccddeeff";

  it("refuses a config with no scheme instead of arming it unverified", () => {
    expect(() => parseWebhookConfig({})).toThrow(/"scheme" is required/);
    expect(() => parseWebhookConfig({ scheme: "" })).toThrow(/"scheme"/);
  });

  it("refuses a config that is not an object, JSON text included", () => {
    expect(() => parseWebhookConfig('{"scheme":"none"}')).toThrow(
      /must be an object/,
    );
    expect(() => parseWebhookConfig([])).toThrow(/must be an object/);
    expect(() => parseWebhookConfig(undefined)).toThrow(/must be an object/);
  });

  it("defaults an explicit none to an async endpoint accepting any method", () => {
    expect(parseWebhookConfig({ scheme: "none" })).toEqual({
      methods: undefined,
      scheme: "none",
      header: "",
      secretRef: undefined,
      toleranceSeconds: 300,
      responseMode: "async",
      responseStatus: 202,
      challengeField: undefined,
      dedupeField: undefined,
      dedupeTtlSeconds: 300,
    });
  });

  it("fills in the header each scheme reads and accepts an override", () => {
    const ref = "secret://v1:00112233445566778899aabbccddeeff";
    expect(
      parseWebhookConfig({ scheme: "hmac-prefixed", secretRef: ref }).header,
    ).toBe("x-hub-signature-256");
    expect(
      parseWebhookConfig({ scheme: "hmac-timestamped", secretRef: ref }).header,
    ).toBe("stripe-signature");
    expect(
      parseWebhookConfig({ scheme: "token", secretRef: ref, header: "X-Auth" })
        .header,
    ).toBe("x-auth");
  });

  const none = (extra: Record<string, unknown>) =>
    parseWebhookConfig({ scheme: "none", ...extra });

  it("reads methods exactly and treats ANY as unrestricted", () => {
    expect(none({ methods: "POST" }).methods).toEqual(["POST"]);
    expect(none({ methods: ["GET", "PUT"] }).methods).toEqual(["GET", "PUT"]);
    expect(none({ methods: "ANY" }).methods).toBeUndefined();
    expect(none({}).methods).toBeUndefined();
  });

  it("rejects a method in the wrong case, a blank one, or ANY among others", () => {
    expect(() => none({ methods: "post" })).toThrow(/"methods"/);
    expect(() => none({ methods: "" })).toThrow(/"methods"/);
    expect(() => none({ methods: ["ANY", "GET"] })).toThrow(/"ANY"/);
  });

  it("switches the default status with the response mode", () => {
    expect(none({ responseMode: "sync" }).responseStatus).toBe(200);
    expect(
      none({ responseMode: "sync", responseStatus: 201 }).responseStatus,
    ).toBe(201);
  });

  it("rejects a response mode it does not know, in any case", () => {
    // "SYNC" would otherwise answer 202 while the author expects the outcome.
    expect(() => none({ responseMode: "SYNC" })).toThrow(/"responseMode"/);
    expect(() => none({ responseMode: "later" })).toThrow(/"responseMode"/);
  });

  it("reads a delivery id out of a header, where some senders put it", () => {
    // A sender that carries its delivery id in a header has no reachable id
    // at all without a source prefix, so it had nothing correct to dedupe on.
    expect(
      parseWebhookConfig({
        scheme: "none",
        dedupeField: "header:X-Delivery-Id",
      }).dedupeField,
    ).toEqual({ header: "x-delivery-id" });
  });

  it("reads a delivery id out of a nested body path", () => {
    expect(
      parseWebhookConfig({ scheme: "none", dedupeField: "body:data.object.id" })
        .dedupeField,
    ).toEqual({ body: "data.object.id" });
  });

  it("leaves a bare name bare, and a colon that is not a source alone", () => {
    // Stripe's own event id is the top-level `id`, which is the bare form.
    expect(
      parseWebhookConfig({ scheme: "none", dedupeField: "id" }).dedupeField,
    ).toBe("id");
    expect(
      parseWebhookConfig({ scheme: "none", challengeField: "hub.challenge" })
        .challengeField,
    ).toBe("hub.challenge");
    expect(
      parseWebhookConfig({ scheme: "none", dedupeField: "ns:id" }).dedupeField,
    ).toBe("ns:id");
  });

  it("accepts the reactor's own object form, for a config the editor did not write", () => {
    expect(
      parseWebhookConfig({
        scheme: "none",
        challengeField: { header: "X-Hook-Challenge" },
      }).challengeField,
    ).toEqual({ header: "x-hook-challenge" });
    expect(() =>
      parseWebhookConfig({ scheme: "none", dedupeField: { query: "id" } }),
    ).toThrow(/"header" or "body"/);
  });

  it("leaves the digest options unset unless the author changed one", () => {
    // Undefined, not restated defaults: the reactor owns what sha256/hex mean,
    // and copying them here would freeze this config against a change there.
    const config = parseWebhookConfig({ scheme: "hmac", secretRef: REF });
    expect(config.algorithm).toBeUndefined();
    expect(config.encoding).toBeUndefined();
    expect(config.prefix).toBeUndefined();
  });

  it("carries the hash, the encoding and the label through", () => {
    expect(
      parseWebhookConfig({
        scheme: "hmac-prefixed",
        secretRef: REF,
        algorithm: "sha1",
        encoding: "base64",
        prefix: "sig=",
      }),
    ).toMatchObject({ algorithm: "sha1", encoding: "base64", prefix: "sig=" });
  });

  it("compares the hash and encoding case-exact", () => {
    expect(() =>
      parseWebhookConfig({ scheme: "hmac", secretRef: REF, algorithm: "SHA1" }),
    ).toThrow(/"algorithm"/);
    expect(() =>
      parseWebhookConfig({
        scheme: "hmac",
        secretRef: REF,
        encoding: "Base64",
      }),
    ).toThrow(/"encoding"/);
    expect(() =>
      parseWebhookConfig({ scheme: "HMAC", secretRef: REF }),
    ).toThrow(/"scheme"/);
  });

  it("uses the default label only when no prefix is given", () => {
    const base = { scheme: "hmac-prefixed", secretRef: REF };
    expect(parseWebhookConfig(base).prefix).toBeUndefined();
    expect(
      parseWebhookConfig({ ...base, prefix: null }).prefix,
    ).toBeUndefined();
    expect(() => parseWebhookConfig({ ...base, prefix: 1 })).toThrow(
      /"prefix"/,
    );
  });

  it("keeps an empty label, which is not the same as omitting it", () => {
    // "" means a prefixed layout with no label at all; undefined means the
    // hash's own label. Coercing "" away would make that unsayable.
    expect(
      parseWebhookConfig({
        scheme: "hmac-prefixed",
        secretRef: REF,
        prefix: "",
      }).prefix,
    ).toBe("");
  });

  it("rejects a hash or an encoding it cannot honour", () => {
    // Passing it through would fail every delivery with nothing pointing back
    // at the config that caused it.
    expect(() =>
      parseWebhookConfig({ scheme: "hmac", secretRef: REF, algorithm: "md5" }),
    ).toThrow(/"algorithm"/);
    expect(() =>
      parseWebhookConfig({ scheme: "hmac", secretRef: REF, encoding: "utf8" }),
    ).toThrow(/"encoding"/);
  });

  it("rejects a signed scheme with no secret", () => {
    expect(() => parseWebhookConfig({ scheme: "hmac-prefixed" })).toThrow(
      /needs a "secretRef"/,
    );
  });

  it("rejects unknown schemes, methods and out-of-range statuses", () => {
    expect(() => parseWebhookConfig({ scheme: "sha1" })).toThrow(/"scheme"/);
    expect(() =>
      parseWebhookConfig({ scheme: "none", methods: "TRACE" }),
    ).toThrow(/"methods"/);
    expect(() =>
      parseWebhookConfig({ scheme: "none", responseStatus: 700 }),
    ).toThrow(/responseStatus/);
    expect(() =>
      parseWebhookConfig({ scheme: "none", toleranceSeconds: 0 }),
    ).toThrow(/toleranceSeconds/);
    expect(() =>
      parseWebhookConfig({ scheme: "none", dedupeTtlSeconds: -1 }),
    ).toThrow(/dedupeTtlSeconds/);
  });
});
