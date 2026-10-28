// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  REMOTE_BEARER_KEY_PREFIX,
  buildDescriptor,
  remoteHeaders,
  setRemoteBearer,
} from "./provisioning.js";

const URL_A = "http://switchboard.test/graphql";

function jwt(exp: number): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "ES256" })}.${encode({ exp })}.signature`;
}

describe("remote bearers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("keeps a host's bearer in the tab's session storage, by its url", () => {
    setRemoteBearer(URL_A, "Bearer token-a");

    expect(
      window.sessionStorage.getItem(REMOTE_BEARER_KEY_PREFIX + URL_A),
    ).toBe("token-a");
    expect(remoteHeaders(URL_A)).toEqual({ Authorization: "Bearer token-a" });
    expect(remoteHeaders("http://other.test/graphql")).toEqual({});
  });

  it("keys every drive address on a switchboard by its GraphQL url", () => {
    setRemoteBearer("http://switchboard.test/d/a", "token-a");

    expect(
      window.sessionStorage.getItem(REMOTE_BEARER_KEY_PREFIX + URL_A),
    ).toBe("token-a");
    expect(remoteHeaders("http://switchboard.test/d/b")).toEqual({
      Authorization: "Bearer token-a",
    });
  });

  it("reads a bearer a previous page load of this tab stored", () => {
    window.sessionStorage.setItem(REMOTE_BEARER_KEY_PREFIX + URL_A, "kept");

    const descriptor = buildDescriptor({
      name: "after-reload",
      kind: "remote",
      syncMode: "local",
      remoteUrl: "http://switchboard.test/d/powerhouse",
    });

    expect(descriptor.remote?.headers?.()).toEqual({
      Authorization: "Bearer kept",
    });
  });

  it("drops a JWT once its exp has passed, and keeps one that has not", () => {
    const now = Math.floor(Date.now() / 1000);
    setRemoteBearer(URL_A, jwt(now - 60));

    expect(remoteHeaders(URL_A)).toEqual({});
    expect(
      window.sessionStorage.getItem(REMOTE_BEARER_KEY_PREFIX + URL_A),
    ).toBeNull();

    const live = jwt(now + 3600);
    setRemoteBearer(URL_A, live);
    expect(remoteHeaders(URL_A)).toEqual({ Authorization: `Bearer ${live}` });
  });

  it("clears the bearer for an empty one", () => {
    setRemoteBearer(URL_A, "token-a");
    setRemoteBearer(URL_A, "  ");

    expect(remoteHeaders(URL_A)).toEqual({});
  });
});
