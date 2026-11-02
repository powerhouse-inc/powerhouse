import type { IRenown } from "@renown/sdk";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { openRenown } from "../../src/renown/session.js";

/* A desktop window has no popup, and a redirect takes it away from the app. A
   shell that offers an opener sends sign-in to the system browser, and the
   window stays put until Renown's console session says the person finished. */

const USER_DID = "did:pkh:eip155:1:0xabc";

describe("openRenown in a desktop shell", () => {
  let open: MockInstance<typeof window.open>;
  const login = vi.fn();
  const openExternal = vi.fn();
  const fetchSpy = vi.fn();
  const shellWindow = window as Window & {
    phDesktop?: { openExternal: typeof openExternal };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    open = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ status: "ready", did: USER_DID })),
    );
    login.mockResolvedValue({ did: USER_DID });
    const ph = (window.ph ??= {});
    ph.renown = {
      baseUrl: "https://renown.test",
      did: "did:key:zSession",
      login,
    } as unknown as IRenown;
    shellWindow.phDesktop = { openExternal };
  });

  afterEach(() => {
    open.mockRestore();
    vi.unstubAllGlobals();
    delete shellWindow.phDesktop;
    if (window.ph) window.ph.renown = undefined;
  });

  it("opens the console in the system browser and never leaves the window", async () => {
    openRenown();
    await vi.waitFor(() => expect(login).toHaveBeenCalledWith(USER_DID));

    const url = new URL(String(openExternal.mock.calls[0][0]));
    expect(url.origin).toBe("https://renown.test");
    expect(url.pathname).toBe("/console");
    expect(url.searchParams.get("connect")).toBe("did:key:zSession");
    expect(open).not.toHaveBeenCalled();
  });

  it("opens a profile in the system browser", () => {
    openRenown("doc-1");
    expect(openExternal).toHaveBeenCalledWith(
      "https://renown.test/profile/doc-1",
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("keeps the redirect where no shell offers an opener", () => {
    delete shellWindow.phDesktop;
    openRenown();
    expect(open).toHaveBeenCalledOnce();
    expect(String(open.mock.calls[0][0])).toContain("returnUrl=");
    expect(openExternal).not.toHaveBeenCalled();
  });
});
