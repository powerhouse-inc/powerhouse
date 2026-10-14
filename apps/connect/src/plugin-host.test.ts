import { describe, expect, it } from "vitest";
import { applyComposition } from "./plugin-host.js";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";

// R3.2 — the browser composition pipeline. applyComposition transforms the
// served config BEFORE the cache warms; presence is activation.
const base = (): PHConnectRuntimeConfig =>
  ({
    branding: { appName: "Default" },
    app: { studioMode: false },
    ai: { assistantEnabled: false },
    sentry: { dsn: "keep-me", env: "dev" },
    openPanel: { clientId: "keep", trackUiEvents: true, trackOperations: true },
  }) as unknown as PHConnectRuntimeConfig;

describe("applyComposition", () => {
  it("is a no-op without a composition", async () => {
    const cfg = base();
    expect(await applyComposition(cfg)).toBe(cfg);
  });

  it("generic takes its entry config (branding)", async () => {
    const cfg = base();
    cfg.composition = [
      {
        module: "@powerhousedao/connect/plugins/generic",
        config: { branding: { appName: "Composed" } },
      },
    ];
    const out = await applyComposition(cfg);
    expect(out.branding?.appName).toBe("Composed");
  });

  it("vendor adapters: present maps config, absent zeroes the slice", async () => {
    const withSentry = base();
    withSentry.composition = [
      {
        module: "@powerhousedao/connect/plugins/sentry",
        config: { env: "prod" },
      },
    ];
    const a = await applyComposition(withSentry);
    expect(a.sentry?.env).toBe("prod");
    // openpanel absent -> zeroed
    expect(a.openPanel?.clientId).toBe("");
    expect(a.openPanel?.trackOperations).toBe(false);
    // sentry present but no dsn in entry -> keeps served dsn
    expect(a.sentry?.dsn).toBe("keep-me");

    const empty = base();
    empty.composition = [];
    const b = await applyComposition(empty);
    expect(b.sentry?.dsn).toBeNull(); // absent -> zeroed
    expect(b.ai?.assistantEnabled).toBe(false);
  });

  it("studio + assistant presence flips their flags; absence forces off", async () => {
    const on = base();
    on.composition = [
      { module: "@powerhousedao/vetra-studio/connect" },
      { module: "@powerhousedao/connect/plugins/assistant" },
    ];
    const out = await applyComposition(on);
    expect(out.app?.studioMode).toBe(true);
    expect(out.ai?.assistantEnabled).toBe(true);

    const off = base();
    off.app = { studioMode: true } as never; // served true, but not composed
    off.composition = [];
    expect((await applyComposition(off)).app?.studioMode).toBe(false);
  });

  it("unknown specifier warns and skips without throwing", async () => {
    const cfg = base();
    cfg.composition = [{ module: "@acme/not-a-real-plugin" }];
    const out = await applyComposition(cfg);
    expect(out).toBeDefined();
  });
});
