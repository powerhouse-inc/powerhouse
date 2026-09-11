// @vitest-environment happy-dom
import { DriveRequestError, isDriveAuthError } from "@powerhousedao/reactor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDriveInfo } from "../src/actions/drive-info.js";
import type { PHGlobal } from "../src/types/global.js";

/**
 * Drive discovery (`GET <switchboard>/d/:drive`) is the one read a client
 * makes before it can authenticate anything else — `graphqlEndpoint` is what
 * the sync remote is registered with. It used to go out as a bare `fetch(url)`
 * with no Authorization header, so a logged-in user was refused any drive that
 * a `DOCUMENT_PERMISSIONS` switchboard protects, even holding a grant on it.
 */
describe("fetchDriveInfo", () => {
  const fetchMock = vi.fn();
  const getBearerToken = vi.fn();

  const driveInfoBody = {
    id: "drive-1",
    slug: "my-drive",
    name: "My Drive",
    meta: {},
    graphqlEndpoint: "http://switchboard.test/graphql/r",
  };

  function ok() {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(driveInfoBody),
    });
  }

  function status(code: number) {
    return Promise.resolve({
      ok: false,
      status: code,
      json: () => Promise.resolve({ error: "nope" }),
    });
  }

  /** Logged in as a Renown user whose token is `token`. */
  function signedIn(token: string) {
    getBearerToken.mockResolvedValue(token);
    window.ph = {
      renown: { user: { address: "0xuser" }, getBearerToken },
    } as unknown as PHGlobal;
  }

  function signedOut() {
    window.ph = {
      renown: { user: undefined, getBearerToken },
    } as unknown as PHGlobal;
  }

  function sentHeaders(): Record<string, string> {
    const init = fetchMock.mock.calls[0]?.[1] as
      | { headers?: Record<string, string> }
      | undefined;
    return init?.headers ?? {};
  }

  beforeEach(() => {
    fetchMock.mockReset();
    getBearerToken.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.ph = {};
  });

  it("sends the Renown bearer token when the user is logged in", async () => {
    signedIn("tok-abc");
    fetchMock.mockReturnValue(ok());

    await fetchDriveInfo("http://switchboard.test/d/my-drive");

    expect(sentHeaders()).toEqual({ Authorization: "Bearer tok-abc" });
  });

  it("sends the token unconditionally, with no logged-in-user precondition", async () => {
    // The former call site only attached a token `if (user)` and fell back to
    // an anonymous retry on any error, so an expiring token silently
    // downgraded the request instead of surfacing.
    signedIn("tok-xyz");
    fetchMock.mockReturnValue(ok());

    await fetchDriveInfo("http://switchboard.test/d/other-drive");

    expect(getBearerToken).toHaveBeenCalledTimes(1);
    expect(sentHeaders().Authorization).toBe("Bearer tok-xyz");
  });

  it("sends no Authorization header when logged out", async () => {
    // An open switchboard must keep serving discovery to logged-out users:
    // this is how add-remote-drive bootstraps before any login.
    signedOut();
    fetchMock.mockReturnValue(ok());

    await fetchDriveInfo("http://switchboard.test/d/my-drive");

    expect(sentHeaders()).toEqual({});
    expect(getBearerToken).not.toHaveBeenCalled();
  });

  it("returns the parsed drive info", async () => {
    signedOut();
    fetchMock.mockReturnValue(ok());

    await expect(
      fetchDriveInfo("http://switchboard.test/d/my-drive"),
    ).resolves.toEqual(driveInfoBody);
  });

  it("throws a DriveRequestError carrying the status, which reads as an auth error on 401", async () => {
    signedOut();
    fetchMock.mockReturnValue(status(401));

    const error = await fetchDriveInfo(
      "http://switchboard.test/d/my-drive",
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DriveRequestError);
    expect((error as DriveRequestError).statusCode).toBe(401);
    // The point of the typed error: this is what raises the login modal.
    expect(isDriveAuthError(error)).toBe(true);
  });

  it("does not read a 404 as an auth error", async () => {
    // The endpoint answers an unauthorized caller with the same 404 as a
    // missing drive so slugs cannot be enumerated, so a 404 cannot be taken
    // as "log in" without prompting on every mistyped URL.
    signedOut();
    fetchMock.mockReturnValue(status(404));

    const error = await fetchDriveInfo(
      "http://switchboard.test/d/no-such-drive",
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DriveRequestError);
    expect(isDriveAuthError(error)).toBe(false);
  });
});
