// @vitest-environment happy-dom

import { primeRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GENERIC_PLUGIN } from "../plugins/ids.js";

function prime(composition?: { module: string }[]) {
  primeRuntimeConfig({
    connect: { ...DEFAULT_CONNECT_CONFIG, composition },
  } as never);
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("PH_CONNECT_SENTRY_RELEASE", "test");
});
afterEach(cleanup);

// The banner on a first visit: no stored choice.
const banner = () =>
  screen.findByRole("button", { name: /accept/i }, { timeout: 10_000 });

describe("the cookie banner", () => {
  it("shows on a first visit with the generic chrome", async () => {
    prime([{ module: GENERIC_PLUGIN }]);
    const { CookieConsent } = await import("./cookie-consent.js");
    render(<CookieConsent />);
    expect(await banner()).toBeTruthy();
  });

  it("shows in classic Connect, with no composition", async () => {
    prime(undefined);
    const { CookieConsent } = await import("./cookie-consent.js");
    render(<CookieConsent />);
    expect(await banner()).toBeTruthy();
  });

  it("never shows in core mode, and analytics stays rejected", async () => {
    prime([]);
    const { CookieConsent } = await import("./cookie-consent.js");
    const { container } = render(<CookieConsent />);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(container.innerHTML).toBe("");
    // No choice is stored, so the store reads its rejected defaults.
    const { ACCEPTED_COOKIES_KEY_STORAGE } =
      await import("../hooks/preferences-store.js");
    expect(localStorage.getItem(ACCEPTED_COOKIES_KEY_STORAGE)).toBeNull();
  });
});
