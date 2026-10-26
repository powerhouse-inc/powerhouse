import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addBackendAuthEventHandler,
  backendAuthStatusOf,
  isBackendAuthError,
  recordBackendAuthError,
  setBackendAuth,
} from "../src/hooks/backend-auth.js";
import { getPHStore } from "../src/hooks/ph-store.js";

describe("backendAuthStatusOf", () => {
  it("reads graphql-request's ClientError: response.status and the message code", () => {
    expect(
      backendAuthStatusOf({ response: { status: 401 }, message: "x" }),
    ).toBe(401);
    expect(backendAuthStatusOf({ response: { status: 403 } })).toBe(403);
    expect(
      backendAuthStatusOf(
        new Error('GraphQL Error (Code: 401): {"response":{"status":401}}'),
      ),
    ).toBe(401);
  });

  it("reads the sync layer's DriveRequestError statusCode", () => {
    expect(backendAuthStatusOf({ statusCode: 403 })).toBe(403);
    expect(backendAuthStatusOf({ statusCode: 404 })).toBeNull();
  });

  it("looks inside the router's partial-failure error", () => {
    const wrapped = Object.assign(
      new Error("find could not be answered by every backend"),
      {
        failures: [
          { backend: "local", error: new Error("ECONNREFUSED") },
          {
            backend: "switchboard-remote",
            error: { response: { status: 401 } },
          },
        ],
      },
    );
    expect(backendAuthStatusOf(wrapped)).toBe(401);
    expect(isBackendAuthError(wrapped)).toBe(true);
  });

  it("is null for anything else", () => {
    expect(backendAuthStatusOf(new Error("network down"))).toBeNull();
    expect(backendAuthStatusOf(undefined)).toBeNull();
    expect(backendAuthStatusOf("401")).toBeNull();
    expect(backendAuthStatusOf({ response: { status: 500 } })).toBeNull();
    expect(isBackendAuthError({ failures: [{ error: new Error("x") }] })).toBe(
      false,
    );
  });
});

describe("recordBackendAuthError", () => {
  beforeAll(() => {
    addBackendAuthEventHandler();
  });
  beforeEach(() => {
    window.ph = {};
  });
  afterEach(() => {
    setBackendAuth(undefined);
    window.ph = {};
  });

  it("stores the refusal with its status and backend, and leaves other errors alone", () => {
    expect(recordBackendAuthError(new Error("boom"), "sb")).toBe(false);
    expect(getPHStore()?.backendAuth).toBeUndefined();
    expect(
      recordBackendAuthError(
        { response: { status: 401 } },
        "switchboard-remote",
      ),
    ).toBe(true);
    expect(getPHStore()?.backendAuth).toMatchObject({
      requiresAuth: true,
      status: 401,
      backend: "switchboard-remote",
    });
    setBackendAuth(undefined);
    expect(getPHStore()?.backendAuth).toBeUndefined();
  });
});
