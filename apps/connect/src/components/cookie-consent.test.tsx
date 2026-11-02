// @vitest-environment happy-dom

import {
  loadConnectPluginUi,
  registerConnectPlugins,
} from "@powerhousedao/connect-core/plugins";
import { primeRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectPlugins } from "../plugins/index.js";
import { GENERIC_PLUGIN } from "../plugins/ids.js";
import { PluginRoots } from "./plugin-roots.js";

const OPENPANEL = "@powerhousedao/connect/plugins/openpanel";
const SENTRY = "@powerhousedao/connect/plugins/sentry";

// The served composition and its plugins' UI, as the app loads them at boot.
async function serve(composition?: { module: string }[], cookieBanner = true) {
  primeRuntimeConfig({
    connect: {
      ...DEFAULT_CONNECT_CONFIG,
      app: { ...DEFAULT_CONNECT_CONFIG.app, cookieBanner },
      composition,
    },
  } as never);
  await loadConnectPluginUi(composition);
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("PH_CONNECT_SENTRY_RELEASE", "test");
  registerConnectPlugins(connectPlugins);
});
afterEach(cleanup);

// The banner on a first visit: no stored choice.
const banner = () =>
  screen.findByRole("button", { name: /accept/i }, { timeout: 10_000 });

// The first test loads the plugins' UI cold, slow on Windows runners.
describe("the cookie banner", { timeout: 20_000 }, () => {
  it("shows on a first visit with the openpanel plugin", async () => {
    await serve([{ module: OPENPANEL }]);
    render(<PluginRoots />);
    expect(await banner()).toBeTruthy();
  });

  it("shows for Sentry without the openpanel plugin", async () => {
    await serve([{ module: GENERIC_PLUGIN }, { module: SENTRY }]);
    render(<PluginRoots />);
    expect(await banner()).toBeTruthy();
  });

  it("shows in classic Connect, with no composition", async () => {
    await serve(undefined);
    render(<PluginRoots />);
    expect(await banner()).toBeTruthy();
  });

  it("never shows without a plugin that needs consent, and analytics stays rejected", async () => {
    for (const composition of [[{ module: GENERIC_PLUGIN }], []]) {
      await serve(composition);
      const { container } = render(<PluginRoots />);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(container.innerHTML).toBe("");
      cleanup();
    }
    // No choice is stored, so the store reads its rejected defaults.
    const { ACCEPTED_COOKIES_KEY_STORAGE } =
      await import("../hooks/preferences-store.js");
    expect(localStorage.getItem(ACCEPTED_COOKIES_KEY_STORAGE)).toBeNull();
  });

  // `ph vetra` turns it off for the local Studio.
  it("never shows when the config turns it off", async () => {
    await serve(undefined, false);
    const { container } = render(<PluginRoots />);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(container.innerHTML).toBe("");
  });
});
