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

/* The `returnUrl` handed to renown.id is where the user lands after signing in.
   Connect reads `?driveUrl` exactly once, at reactor creation, so a returnUrl
   that has lost the query string drops the user on a driveless app. It must
   carry the current location forward -- minus the params that would re-arm a
   redirect handler when they came back around. */

let open: MockInstance<typeof window.open>;
let originalHref: string;

beforeEach(() => {
  originalHref = window.location.href;
  // `openRenown` navigates with `window.open(url, "_self")`; never in a test.
  open = vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  open.mockRestore();
  window.history.replaceState(null, "", originalHref);
});

// `window.location` is not redefinable in Chromium; `replaceState` really does
// move `location.search`/`.hash`, which is what `openRenown` reads.
function returnUrlFor(path: string): URL {
  window.history.replaceState(null, "", path);
  openRenown();
  const target = new URL(String(open.mock.calls[0]?.[0]));
  return new URL(target.searchParams.get("returnUrl")!);
}

const DRIVE_URL = "https://switchboard.test/d/powerhouse";

describe("openRenown returnUrl", () => {
  it("carries the query string and fragment forward", () => {
    const returnUrl = returnUrlFor(
      `/?driveUrl=${encodeURIComponent(DRIVE_URL)}#/d/powerhouse`,
    );

    expect(returnUrl.searchParams.get("driveUrl")).toBe(DRIVE_URL);
    expect(returnUrl.hash).toBe("#/d/powerhouse");
  });

  it("strips a stale `user` DID while keeping the rest", () => {
    const returnUrl = returnUrlFor(
      `/?driveUrl=${encodeURIComponent(DRIVE_URL)}&user=did%3Apkh%3Astale`,
    );

    expect(returnUrl.searchParams.has("user")).toBe(false);
    expect(returnUrl.searchParams.get("driveUrl")).toBe(DRIVE_URL);
  });

  it("strips `privy_oauth_code` while keeping the rest", () => {
    const returnUrl = returnUrlFor(
      `/?driveUrl=${encodeURIComponent(DRIVE_URL)}&privy_oauth_code=abc123`,
    );

    expect(returnUrl.searchParams.has("privy_oauth_code")).toBe(false);
    expect(returnUrl.searchParams.get("driveUrl")).toBe(DRIVE_URL);
  });

  it("strips `privy_oauth_state` while keeping the rest", () => {
    const returnUrl = returnUrlFor(
      `/?driveUrl=${encodeURIComponent(DRIVE_URL)}&privy_oauth_state=xyz789`,
    );

    expect(returnUrl.searchParams.has("privy_oauth_state")).toBe(false);
    expect(returnUrl.searchParams.get("driveUrl")).toBe(DRIVE_URL);
  });

  it("keeps feature-flag params", () => {
    const returnUrl = returnUrlFor("/?ph_enable_experiment=true&embed=true");

    expect(returnUrl.searchParams.get("ph_enable_experiment")).toBe("true");
    expect(returnUrl.searchParams.get("embed")).toBe("true");
  });
});
