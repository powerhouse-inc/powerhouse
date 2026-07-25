import { describe, expect, it } from "vitest";
import {
  parseAttachmentDownloadTarget,
  parseAttachmentUploadTarget,
} from "../src/targets.js";

const EXPIRES = "2026-07-21T12:00:00.000Z";

describe("attachment transfer target parsing", () => {
  it("preserves an opaque presigned URL and exact headers", () => {
    const url =
      "https://s3.example.test/bucket/key?X-Amz-Signature=a%2Bb&partNumber=1";
    const target = parseAttachmentUploadTarget({
      kind: "presigned-put",
      method: "PUT",
      url,
      headers: {
        "content-type": "application/pdf",
        "x-amz-checksum-sha256": "abc=",
      },
      expiresAtUtc: EXPIRES,
    });

    expect(target.url).toBe(url);
    expect(target.headers).toEqual({
      "content-type": "application/pdf",
      "x-amz-checksum-sha256": "abc=",
    });
  });

  it("preserves prototype-sensitive header names as own properties", () => {
    const headers = JSON.parse('{"__proto__":"signed-value"}') as Record<
      string,
      string
    >;
    const target = parseAttachmentUploadTarget({
      kind: "presigned-put",
      method: "PUT",
      url: "https://s3.example.test/object?signature=opaque",
      headers,
      expiresAtUtc: EXPIRES,
    });

    expect(Object.getPrototypeOf(target.headers)).toBeNull();
    expect(Object.hasOwn(target.headers, "__proto__")).toBe(true);
    expect(target.headers.__proto__).toBe("signed-value");
    expect(new Headers(Object.entries(target.headers)).get("__proto__")).toBe(
      "signed-value",
    );
  });

  it.each([
    [{ kind: "other", method: "PUT", url: "https://x.test", headers: {} }],
    [
      {
        kind: "switchboard",
        method: "POST",
        url: "https://x.test",
        headers: {},
      },
    ],
    [{ kind: "switchboard", method: "PUT", url: "", headers: {} }],
    [{ kind: "switchboard", method: "PUT", url: "not a URL", headers: {} }],
    [
      {
        kind: "switchboard",
        method: "PUT",
        url: " https://x.test",
        headers: {},
      },
    ],
    [{ kind: "switchboard", method: "PUT", url: "file:///tmp/x", headers: {} }],
    [
      {
        kind: "switchboard",
        method: "PUT",
        url: "https://x.test",
        headers: { "bad name": "x" },
      },
    ],
    [
      {
        kind: "switchboard",
        method: "PUT",
        url: "https://x.test",
        headers: { good: "not-byte-string-Ā" },
      },
    ],
    [
      {
        kind: "switchboard",
        method: "PUT",
        url: "https://x.test",
        headers: { good: "x\r\ny" },
      },
    ],
    [
      {
        kind: "presigned-put",
        method: "PUT",
        url: "https://x.test",
        headers: {},
      },
    ],
    [
      {
        kind: "presigned-put",
        method: "PUT",
        url: "https://x.test",
        headers: {},
        expiresAtUtc: "tomorrow",
      },
    ],
  ])("rejects an invalid upload target: %j", (value) => {
    expect(() => parseAttachmentUploadTarget(value)).toThrow();
  });

  it("accepts a Switchboard upload target without target-specific expiry", () => {
    expect(
      parseAttachmentUploadTarget({
        kind: "switchboard",
        method: "PUT",
        url: "https://switchboard.test/attachments/reservations/r-1",
        headers: { Authorization: "Bearer token" },
      }),
    ).toMatchObject({ kind: "switchboard", method: "PUT" });
  });

  it("accepts a presigned GET and requires the GET method", () => {
    expect(
      parseAttachmentDownloadTarget({
        kind: "presigned-get",
        method: "GET",
        url: "https://s3.example.test/object?signature=opaque",
        headers: {},
        expiresAtUtc: EXPIRES,
      }),
    ).toMatchObject({ kind: "presigned-get", method: "GET" });
    expect(() =>
      parseAttachmentDownloadTarget({
        kind: "switchboard",
        method: "PUT",
        url: "https://switchboard.test/attachments/hash",
        headers: {},
      }),
    ).toThrow(/must be GET/);
  });
});
