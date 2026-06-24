import { describe, expect, it } from "vitest";
import {
  ChannelError,
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

describe("isDriveAuthError", () => {
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
