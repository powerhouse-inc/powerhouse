import { describe, expect, it } from "vitest";
import {
  ChannelError,
  GraphQLRequestError,
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
