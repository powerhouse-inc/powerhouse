// Config parsing for the core#webhook trigger block; verification, tokens,
// redaction, dedupe and rate limiting live in the reactor's webhook service.
import { describe, expect, it } from "vitest";
import { parseWebhookConfig } from "./webhook.js";

describe("parseWebhookConfig", () => {
  const REF = "secret://v1:00112233445566778899aabbccddeeff";

  it("defaults to an unsigned async endpoint accepting any method", () => {
    expect(parseWebhookConfig({})).toEqual({
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

  it("normalises methods and treats ANY as unrestricted", () => {
    expect(parseWebhookConfig({ methods: "post" }).methods).toEqual(["POST"]);
    expect(parseWebhookConfig({ methods: ["get", "PUT"] }).methods).toEqual([
      "GET",
      "PUT",
    ]);
    expect(parseWebhookConfig({ methods: "ANY" }).methods).toBeUndefined();
    expect(parseWebhookConfig({ methods: "" }).methods).toBeUndefined();
  });

  it("switches the default status with the response mode", () => {
    expect(parseWebhookConfig({ responseMode: "sync" }).responseStatus).toBe(
      200,
    );
    expect(
      parseWebhookConfig({ responseMode: "sync", responseStatus: 201 })
        .responseStatus,
    ).toBe(201);
  });

  it("accepts a JSON-encoded config, as the document may hold one", () => {
    expect(parseWebhookConfig('{"methods":"POST"}').methods).toEqual(["POST"]);
  });

  it("reads a delivery id out of a header, where some senders put it", () => {
    // A sender that carries its delivery id in a header has no reachable id
    // at all without a source prefix, so it had nothing correct to dedupe on.
    expect(
      parseWebhookConfig({ dedupeField: "header:X-Delivery-Id" }).dedupeField,
    ).toEqual({ header: "x-delivery-id" });
  });

  it("reads a delivery id out of a nested body path", () => {
    expect(
      parseWebhookConfig({ dedupeField: "body:data.object.id" }).dedupeField,
    ).toEqual({ body: "data.object.id" });
  });

  it("leaves a bare name bare, and a colon that is not a source alone", () => {
    // Stripe's own event id is the top-level `id`, which is the bare form.
    expect(parseWebhookConfig({ dedupeField: "id" }).dedupeField).toBe("id");
    expect(
      parseWebhookConfig({ challengeField: "hub.challenge" }).challengeField,
    ).toBe("hub.challenge");
    expect(parseWebhookConfig({ dedupeField: "ns:id" }).dedupeField).toBe(
      "ns:id",
    );
  });

  it("accepts the reactor's own object form, for a config the editor did not write", () => {
    expect(
      parseWebhookConfig({ challengeField: { header: "X-Hook-Challenge" } })
        .challengeField,
    ).toEqual({ header: "x-hook-challenge" });
    expect(() => parseWebhookConfig({ dedupeField: { query: "id" } })).toThrow(
      /"header" or "body"/,
    );
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
        algorithm: "SHA1",
        encoding: "Base64",
        prefix: "sig=",
      }),
    ).toMatchObject({ algorithm: "sha1", encoding: "base64", prefix: "sig=" });
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
    expect(() => parseWebhookConfig({ methods: "TRACE" })).toThrow(/TRACE/);
    expect(() => parseWebhookConfig({ responseStatus: 700 })).toThrow(
      /responseStatus/,
    );
    expect(() => parseWebhookConfig({ toleranceSeconds: 0 })).toThrow(
      /toleranceSeconds/,
    );
    expect(() => parseWebhookConfig({ dedupeTtlSeconds: -1 })).toThrow(
      /dedupeTtlSeconds/,
    );
  });
});
