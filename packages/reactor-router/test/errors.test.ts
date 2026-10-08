import { describe, expect, it } from "vitest";
import {
  isMisroute,
  misrouteOf,
  WRONG_SHARD_CODE,
  WrongBackendError,
} from "../src/errors.js";

describe("misrouteOf", () => {
  it("recognises a live error", () => {
    const error = new WrongBackendError({
      collectionId: "drive.main.drive-a",
      documentId: "doc-1",
      ownerHint: "two",
      rejectedBy: "one",
      operation: "execute",
    });

    expect(misrouteOf(error)).toMatchObject({
      misrouted: true,
      collectionId: "drive.main.drive-a",
      documentId: "doc-1",
      ownerHint: "two",
      rejectedBy: "one",
    });
  });

  it("recognises one that lost its prototype and custom fields", () => {
    const original = new WrongBackendError({
      collectionId: "drive.main.drive-a",
      documentId: "doc-1",
      ownerHint: "two",
      rejectedBy: "one",
    });
    const crossed = new Error(original.message);
    crossed.name = original.name;

    expect(misrouteOf(crossed)).toMatchObject({
      misrouted: true,
      documentId: "doc-1",
      rejectedBy: "one",
    });
  });

  it("recognises a reactor-api wrong-shard body", () => {
    expect(
      misrouteOf({ error: WRONG_SHARD_CODE, driveId: "drive-a" }),
    ).toMatchObject({ misrouted: true, documentId: "drive-a" });
  });

  it("treats anything else as not a misroute", () => {
    expect(isMisroute(new Error("document not found"))).toBe(false);
    expect(isMisroute(undefined)).toBe(false);
    expect(isMisroute("wrong-backend")).toBe(false);
  });
});
