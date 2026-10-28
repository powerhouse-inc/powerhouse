import { hostExportSchema } from "@powerhousedao/host-core/schema";
import { describe, expect, it } from "vitest";
import { stack } from "../host-rules/__fixtures__/hosts.js";
import {
  baseDigest,
  baseDigestSchema,
  draftRequestSchema,
  hostRequestSchema,
} from "./api.js";

function reversed(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversed);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, child]) => [key, reversed(child)]),
  );
}

describe("baseDigest", () => {
  it("ignores key order and matches its schema", async () => {
    const envelope = stack();
    const digest = await baseDigest(envelope);
    expect(baseDigestSchema.safeParse(digest).success).toBe(true);
    expect(await baseDigest(reversed(envelope) as typeof envelope)).toBe(
      digest,
    );
  });

  it("hashes a parsed export like the raw one", async () => {
    const envelope = stack();
    expect(await baseDigest(hostExportSchema.parse(envelope))).toBe(
      await baseDigest(envelope),
    );
  });

  it("changes with any value", async () => {
    const envelope = stack();
    expect(await baseDigest({ ...envelope, name: "other" })).not.toBe(
      await baseDigest(envelope),
    );
  });
});

describe("draftRequestSchema", () => {
  const request = {
    project: "/p",
    host: "stack",
    baseDigest: "a".repeat(64),
    setters: [{ path: "host.name", value: "Stack" }],
  };

  it("accepts a draft and leaves the host request strict", () => {
    expect(draftRequestSchema.safeParse(request).success).toBe(true);
    expect(hostRequestSchema.safeParse(request).success).toBe(false);
  });

  it.each([
    ["an unknown key", { ...request, envelope: {} }],
    ["a short digest", { ...request, baseDigest: "abc" }],
    ["an uppercase digest", { ...request, baseDigest: "A".repeat(64) }],
    [
      "a bad delete marker",
      { ...request, setters: [{ path: "host.name", value: { $delete: 1 } }] },
    ],
  ])("refuses %s", (_name, body) => {
    expect(draftRequestSchema.safeParse(body).success).toBe(false);
  });
});
