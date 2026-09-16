// Whether a request is a sender's probe, and how the piece's answer is shaped.
// Match too widely and every delivery is answered as a probe.
import type { WebhookRequest } from "@powerhousedao/shared/processors";
import { describe, expect, it } from "vitest";
import { handshakeMatches, handshakeReply } from "./piece-handshake.js";

const request = (overrides: Partial<WebhookRequest> = {}): WebhookRequest => ({
  key: "wf-1",
  method: "POST",
  path: "/webhooks/t",
  queryParams: {},
  headers: { "content-type": "application/json" },
  raw: Buffer.from("{}", "utf8"),
  body: {},
  ...overrides,
});

describe("handshakeMatches", () => {
  it("matches a header regardless of the case the trigger declared", () => {
    // Headers arrive lowercased, and a piece names its own in mixed case.
    const handshake = { strategy: "HEADER_PRESENT", paramName: "X-Hook-Token" };
    expect(
      handshakeMatches(
        handshake,
        request({ headers: { "x-hook-token": "abc" } }),
      ),
    ).toBe(true);
    expect(handshakeMatches(handshake, request())).toBe(false);
  });

  it("matches a query param, and only by presence", () => {
    const handshake = { strategy: "QUERY_PRESENT", paramName: "challenge" };
    // An empty value is still a probe: presence is what the sender signals.
    expect(
      handshakeMatches(handshake, request({ queryParams: { challenge: "" } })),
    ).toBe(true);
    expect(
      handshakeMatches(handshake, request({ queryParams: { other: "1" } })),
    ).toBe(false);
  });

  it("matches a top-level body param", () => {
    const handshake = {
      strategy: "BODY_PARAM_PRESENT",
      paramName: "challenge",
    };
    expect(
      handshakeMatches(handshake, request({ body: { challenge: "abc" } })),
    ).toBe(true);
    expect(handshakeMatches(handshake, request({ body: { id: 1 } }))).toBe(
      false,
    );
  });

  it("does not read a body that is not an object", () => {
    // A text or array body has no named params, and indexing it would throw.
    const handshake = {
      strategy: "BODY_PARAM_PRESENT",
      paramName: "challenge",
    };
    expect(handshakeMatches(handshake, request({ body: "text" }))).toBe(false);
    expect(handshakeMatches(handshake, request({ body: [1, 2] }))).toBe(false);
    expect(handshakeMatches(handshake, request({ body: null }))).toBe(false);
  });

  it("matches HEAD by method, ignoring any field name", () => {
    const handshake = { strategy: "HEAD_REQUEST" };
    expect(handshakeMatches(handshake, request({ method: "HEAD" }))).toBe(true);
    expect(handshakeMatches(handshake, request({ method: "head" }))).toBe(true);
    expect(handshakeMatches(handshake, request({ method: "POST" }))).toBe(
      false,
    );
  });

  it("never matches a strategy that names no field", () => {
    // Matching everything here would answer every delivery as a probe.
    expect(handshakeMatches({ strategy: "HEADER_PRESENT" }, request())).toBe(
      false,
    );
    expect(handshakeMatches({ strategy: "NONE" }, request())).toBe(false);
    expect(handshakeMatches({ strategy: "FUTURE" }, request())).toBe(false);
  });
});

describe("handshakeReply", () => {
  it("answers a bare 200 when the hook returned nothing useful", () => {
    // The framework's default onHandshake is exactly `{status: 200}`, and a
    // piece that declares none still gets that default.
    expect(handshakeReply(undefined)).toEqual({ status: 200 });
    expect(handshakeReply(null)).toEqual({ status: 200 });
    expect(handshakeReply({})).toEqual({ status: 200 });
  });

  it("passes a string body through verbatim", () => {
    // The sender compares it byte for byte, so it must not be re-encoded.
    expect(handshakeReply({ status: 200, body: "abc123" })).toEqual({
      status: 200,
      body: "abc123",
    });
  });

  it("serialises an object body and says it is JSON", () => {
    expect(handshakeReply({ body: { challenge: "abc" } })).toEqual({
      status: 200,
      body: '{"challenge":"abc"}',
      contentType: "application/json",
    });
  });

  it("keeps the status the piece chose", () => {
    expect(handshakeReply({ status: 204 })).toEqual({ status: 204 });
  });
});
