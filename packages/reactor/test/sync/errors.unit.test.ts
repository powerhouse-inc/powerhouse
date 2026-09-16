import { describe, expect, it } from "vitest";
import {
  ChannelError,
  DriveRequestError,
  GraphQLRequestError,
  isDriveAuthError,
  PollingChannelError,
} from "../../src/sync/errors.js";
import { ChannelErrorSource } from "../../src/sync/types.js";

describe("GraphQLRequestError", () => {
  it("captures category and status code", () => {
    const err = new GraphQLRequestError("boom", "http", 503);
    expect(err.name).toBe("GraphQLRequestError");
    expect(err.message).toBe("boom");
    expect(err.category).toBe("http");
    expect(err.statusCode).toBe(503);
  });

  it("allows omitting status code", () => {
    const err = new GraphQLRequestError("boom", "network");
    expect(err.statusCode).toBeUndefined();
  });
});

describe("PollingChannelError", () => {
  it("constructs with message", () => {
    const err = new PollingChannelError("offline");
    expect(err.name).toBe("PollingChannelError");
    expect(err.message).toBe("offline");
  });
});

describe("DriveRequestError", () => {
  it("captures message and status code", () => {
    const err = new DriveRequestError("boom", 401);
    expect(err.name).toBe("DriveRequestError");
    expect(err.message).toBe("boom");
    expect(err.statusCode).toBe(401);
  });

  it("allows omitting the status code", () => {
    expect(new DriveRequestError("offline").statusCode).toBeUndefined();
  });
});

describe("isDriveAuthError", () => {
  // Drive discovery (GET /d/:drive) is REST, so its refusals arrive as
  // DriveRequestError. Before this they were bare Errors, which this
  // predicate rejected — so a switchboard refusing the caller surfaced as
  // "drive not reachable" and never prompted a login.
  it("is true for a DriveRequestError carrying 401 or 403", () => {
    expect(isDriveAuthError(new DriveRequestError("nope", 401))).toBe(true);
    expect(isDriveAuthError(new DriveRequestError("nope", 403))).toBe(true);
  });

  it("is false for a DriveRequestError carrying any other status", () => {
    // 404 in particular: the drive info endpoint answers an unauthorized
    // caller with the same 404 it gives a missing drive, so that slugs cannot
    // be enumerated. Treating 404 as an auth error would pop a login modal on
    // every mistyped URL.
    for (const status of [400, 404, 500, 503]) {
      expect(isDriveAuthError(new DriveRequestError("nope", status))).toBe(
        false,
      );
    }
  });

  it("is false for a DriveRequestError with no status (network failure)", () => {
    expect(isDriveAuthError(new DriveRequestError("offline"))).toBe(false);
  });

  it("is false for a bare Error, whatever it says", () => {
    expect(isDriveAuthError(new Error("Forbidden: 401"))).toBe(false);
  });

  it("is true for HTTP 401 and 403", () => {
    expect(isDriveAuthError(new GraphQLRequestError("nope", "http", 401))).toBe(
      true,
    );
    expect(isDriveAuthError(new GraphQLRequestError("nope", "http", 403))).toBe(
      true,
    );
  });

  it("is false for other HTTP status codes", () => {
    for (const status of [400, 404, 500, 503]) {
      expect(
        isDriveAuthError(new GraphQLRequestError("nope", "http", status)),
      ).toBe(false);
    }
  });

  it("is true for a Forbidden GraphQL error", () => {
    const err = new GraphQLRequestError(
      'GraphQL errors: [{ "message": "Forbidden: insufficient permissions to read this document" }]',
      "graphql",
    );
    expect(isDriveAuthError(err)).toBe(true);
  });

  it("is true for an authentication-required GraphQL error", () => {
    const err = new GraphQLRequestError(
      'GraphQL errors: [{ "message": "Forbidden: authentication required to create documents" }]',
      "graphql",
    );
    expect(isDriveAuthError(err)).toBe(true);
  });

  it("is false for a non-auth GraphQL error", () => {
    const err = new GraphQLRequestError(
      'GraphQL errors: [{ "message": "Validation failed" }]',
      "graphql",
    );
    expect(isDriveAuthError(err)).toBe(false);
  });

  it("is false for network/parse/missing-data errors", () => {
    expect(isDriveAuthError(new GraphQLRequestError("down", "network"))).toBe(
      false,
    );
    expect(isDriveAuthError(new GraphQLRequestError("bad", "parse"))).toBe(
      false,
    );
    expect(
      isDriveAuthError(new GraphQLRequestError("empty", "missing-data")),
    ).toBe(false);
  });

  it("is false for a plain Error whose message merely mentions 403", () => {
    expect(isDriveAuthError(new Error("Failed to resolve drive (403)"))).toBe(
      false,
    );
    expect(isDriveAuthError("forbidden")).toBe(false);
    expect(isDriveAuthError(undefined)).toBe(false);
  });
});

describe("ChannelError", () => {
  it("wraps an inner error with source-tagged message", () => {
    const inner = new Error("inner");
    const err = new ChannelError(ChannelErrorSource.Inbox, inner);
    expect(err.name).toBe("ChannelError");
    expect(err.source).toBe(ChannelErrorSource.Inbox);
    expect(err.error).toBe(inner);
    expect(err.message).toContain("ChannelError");
    expect(err.message).toContain("inner");
  });
});
