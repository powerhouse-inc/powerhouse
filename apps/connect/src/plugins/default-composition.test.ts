import { defaultConnectComposition } from "@powerhousedao/host-core";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import {
  DEFAULT_CONNECT_CONFIG,
  deepMerge,
} from "@powerhousedao/shared/connect";
import {
  applyComposition,
  registerConnectPlugins,
} from "@powerhousedao/connect-core/plugins";
import { describe, expect, it, vi } from "vitest";
import { connectPlugins } from "./index.js";

registerConnectPlugins(connectPlugins);

// A Connect host without `runner.plugins` is served host-core's default
// composition. Run through the built-ins, it has to leave the config exactly
// as Connect serves it with no composition at all.

/** `config` over the defaults: what Connect reads with no composition. The
 * defaults leave `app.workflowsEnabled` unset, which Connect reads as off
 * (connect.config.ts) and a composition without the workflows plugin writes
 * as `false`. */
const classic = (config: PHConnectRuntimeConfig) =>
  deepMerge(
    deepMerge(DEFAULT_CONNECT_CONFIG, { app: { workflowsEnabled: false } }),
    config,
  );

const CONFIGS: [string, PHConnectRuntimeConfig][] = [
  ["the defaults", {}],
  ["add-drive off", { drives: { allowAddDrive: false } }],
  [
    "one drive section partly off",
    { drives: { sections: { local: { allowAdd: false } } } },
  ],
  [
    "both drive sections off",
    {
      drives: {
        sections: {
          remote: { enabled: false, allowAdd: false, allowDelete: false },
          local: { enabled: false, allowAdd: false, allowDelete: false },
        },
      },
    },
  ],
  [
    "explorer icons and a home background",
    {
      drives: { icons: { folder: "data:image/png;base64,AA==" } },
      home: { background: "data:image/png;base64,AA==" },
    },
  ],
  [
    "icons and background reset",
    { drives: { icons: null }, home: { background: null } },
  ],
  ["Sentry on", { sentry: { dsn: "https://k@sentry.example/1", env: "prod" } }],
  ["Sentry off, with an env", { sentry: { dsn: null, env: "staging" } }],
  [
    "OpenPanel on, UI events untracked",
    { openPanel: { clientId: "abc", trackUiEvents: false } },
  ],
  ["OpenPanel off, tracking set", { openPanel: { trackOperations: false } }],
  ["the assistant on", { ai: { assistantEnabled: true } }],
  ["the assistant off", { ai: { assistantEnabled: false } }],
  ["workflows on", { app: { workflowsEnabled: true } }],
  ["workflows off", { app: { workflowsEnabled: false } }],
  ["studio mode on", { app: { studioMode: true } }],
  ["studio mode off", { app: { studioMode: false } }],
  [
    "everything on",
    {
      drives: {
        allowAddDrive: true,
        icons: { folder: "data:image/png;base64,AA==" },
        defaultDrives: [{ url: "http://x/d/a", name: null, icon: null }],
      },
      home: { background: "data:image/png;base64,AA==" },
      sentry: { dsn: "https://k@sentry.example/1" },
      openPanel: { clientId: "abc" },
      ai: { assistantEnabled: true },
      app: { studioMode: true, workflowsEnabled: true },
      branding: { appName: "Lab" },
    },
  ],
  [
    "everything off",
    {
      drives: {
        allowAddDrive: false,
        sections: {
          remote: { enabled: false, allowAdd: false, allowDelete: false },
          local: { enabled: false, allowAdd: false, allowDelete: false },
        },
        icons: null,
      },
      home: { background: null },
      sentry: { dsn: null },
      openPanel: { clientId: "", trackUiEvents: false, trackOperations: false },
      ai: { assistantEnabled: false },
      app: { studioMode: false, workflowsEnabled: false },
    },
  ],
];

describe("the default composition serves the config Connect serves with none", () => {
  vi.spyOn(console, "info").mockImplementation(() => {});

  it.each(CONFIGS)("%s", async (_name, config) => {
    const served = classic(config);
    const composition = defaultConnectComposition(served);
    const { composition: applied, ...out } = await applyComposition({
      ...served,
      composition,
    });
    expect(applied).toEqual(composition);
    expect(out).toEqual(served);
  });

  // The runner works it out from a config that may lack the defaults (a
  // build's config file under the host's): the built-ins fall back to them.
  it.each(CONFIGS)(
    "%s, worked out before the defaults",
    async (_name, config) => {
      const { composition: _applied, ...out } = await applyComposition({
        ...classic(config),
        composition: defaultConnectComposition(config),
      });
      expect(out).toEqual(classic(config));
    },
  );

  it("names only plugins Connect knows", () => {
    const composition = defaultConnectComposition({
      ai: { assistantEnabled: true },
      app: { studioMode: true, workflowsEnabled: true },
    });
    expect(composition.map((entry) => entry.module).sort()).toEqual(
      Object.keys(connectPlugins).sort(),
    );
  });

  it("puts the generic plugin first, so its shell is the one picked", () => {
    const [first] = defaultConnectComposition({});
    expect(connectPlugins[first.module].shell).toBe("generic");
  });
});
