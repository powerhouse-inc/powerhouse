import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consoleLogin } from "../src/console-login.js";
import type { IRenown, User } from "../src/types.js";

const RENOWN = "https://renown.test";
const DID = "did:key:zSession";
const USER_DID = "did:pkh:eip155:1:0xabc";

const ready = () =>
  new Response(
    JSON.stringify({ status: "ready", did: USER_DID, sessionId: "s" }),
  );
const pending = () =>
  new Response(JSON.stringify({ status: "pending", sessionId: "s" }));

describe("consoleLogin", () => {
  const user = { did: USER_DID } as User;
  const login = vi.fn();
  const renown = { did: DID, login } as unknown as IRenown;
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    login.mockResolvedValue(user);
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the console for this key, polls, then logs in with no redirect", async () => {
    fetchSpy.mockResolvedValueOnce(pending()).mockResolvedValueOnce(ready());
    const open = vi.fn();

    await expect(
      consoleLogin(renown, { renownUrl: RENOWN, open }),
    ).resolves.toBe(user);

    const url = new URL(open.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/console");
    expect(url.searchParams.get("connect")).toBe(DID);
    expect(url.searchParams.get("app")).toBe(DID);
    expect(login).toHaveBeenCalledWith(USER_DID);
  });

  it("goes on polling when the page could not be opened", async () => {
    fetchSpy.mockResolvedValue(ready());
    const onOpenFailed = vi.fn();

    await consoleLogin(renown, {
      renownUrl: RENOWN,
      open: () => Promise.reject(new Error("no browser")),
      onOpenFailed,
    });

    expect(onOpenFailed).toHaveBeenCalledOnce();
    expect(login).toHaveBeenCalledOnce();
  });

  it("rides out a network failure while polling", async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(ready());

    await consoleLogin(renown, { renownUrl: RENOWN, open: () => undefined });

    expect(login).toHaveBeenCalledOnce();
  });

  it("gives up after the timeout", async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(pending()));

    await expect(
      consoleLogin(renown, {
        renownUrl: RENOWN,
        open: () => undefined,
        timeoutMs: 1,
      }),
    ).rejects.toThrow("timed out");
    expect(login).not.toHaveBeenCalled();
  });
});
