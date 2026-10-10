import { describe, expect, it } from "vitest";
import { isMisroute, misrouteOf, WrongBackendError } from "../src/errors.js";

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

  it("recognises one that lost its prototype and custom fields, by name", () => {
    const original = new WrongBackendError({
      documentId: "doc-1",
      rejectedBy: "one",
    });
    const crossed = new Error(original.message);
    crossed.name = original.name;

    expect(misrouteOf(crossed)).toMatchObject({
      misrouted: true,
      documentId: "",
      rejectedBy: "",
    });
  });

  it("treats anything else as not a misroute", () => {
    expect(isMisroute(new Error("document not found"))).toBe(false);
    expect(isMisroute(undefined)).toBe(false);
    expect(isMisroute("wrong-backend")).toBe(false);
  });
});

describe("misrouteOf, exactly two forms", () => {
  it("recognises the GraphQL client's 421 refusal by its shape", () => {
    const error = new Error("421 Misdirected Request");
    error.name = "GraphQLWrongBackendError";
    Object.assign(error, { status: 421, driveId: "drive-a", payload: {} });

    expect(misrouteOf(error)).toMatchObject({
      misrouted: true,
      documentId: "drive-a",
    });
  });

  it("does not take a near miss of that shape for a misroute", () => {
    const wrongStatus = Object.assign(new Error("x"), {
      name: "GraphQLWrongBackendError",
      status: 500,
      driveId: "drive-a",
    });
    const noDrive = Object.assign(new Error("x"), {
      name: "GraphQLWrongBackendError",
      status: 421,
    });

    expect(isMisroute(wrongStatus)).toBe(false);
    expect(isMisroute(noDrive)).toBe(false);
  });

  it("does not read a message or a bare body as a misroute", () => {
    expect(
      isMisroute(
        new Error(
          "wrong-backend: collection=c document=d owner=o rejectedBy=r",
        ),
      ),
    ).toBe(false);
    expect(isMisroute({ error: "wrong-shard", driveId: "drive-a" })).toBe(
      false,
    );
  });
});
