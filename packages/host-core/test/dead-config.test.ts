import { describe, expect, it } from "vitest";
import type { PluginEntryData } from "../src/plugins.js";
import {
  CONNECT_PLUGIN_OWNED_SLICES,
  findDeadConnectConfig,
} from "../src/plugins-resolve.js";

// typed-host-configs 1.6: a Connect config slice whose owning plugin is not
// composed is zeroed by Connect, so an authored value there is "dead config"
// and is reported as a warning.

const WHERE = "hosts/connect/host.js";
const GENERIC = "@powerhousedao/connect/plugins/generic";
const WORKFLOWS = "@powerhousedao/connect/plugins/workflows";

describe("findDeadConnectConfig", () => {
  it("warns about connect.drives.allowAddDrive when the generic plugin is absent (Sektar)", () => {
    const warnings = findDeadConnectConfig(
      { drives: { allowAddDrive: true, defaultDrives: [] } },
      [{ module: WORKFLOWS, config: { drive: "http://x/d/workflows" } }],
      "dev",
      WHERE,
    );
    expect(warnings).toEqual([
      {
        path: "drives.allowAddDrive",
        value: true,
        served: false,
        owner: GENERIC,
        message: expect.stringContaining(
          `${WHERE}: config.drives.allowAddDrive is dead config: it is owned by plugin "${GENERIC}", which this host does not compose for verb "dev", so Connect serves false instead of true.`,
        ) as string,
      },
    ]);
    expect(warnings[0].message).toContain(
      `Hint: compose "${GENERIC}" and set \`allowAddDrive\` in its entry config, or delete the value.`,
    );
  });

  it("is silent when the owning plugin is composed", () => {
    expect(
      findDeadConnectConfig(
        { drives: { allowAddDrive: true } },
        [GENERIC],
        "dev",
        WHERE,
      ),
    ).toEqual([]);
  });

  it("is silent without a declared composition (the classic boot serves the config as is)", () => {
    expect(
      findDeadConnectConfig(
        { drives: { allowAddDrive: true }, app: { studioMode: true } },
        undefined,
        "dev",
        WHERE,
      ),
    ).toEqual([]);
  });

  it("counts only the entries active for the verb", () => {
    const entries: PluginEntryData[] = [
      { module: GENERIC, verbs: ["serve"] },
      { module: "@powerhousedao/vetra-studio/connect", enabled: false },
    ];
    const config = {
      drives: { allowAddDrive: true },
      app: { studioMode: true },
    };
    expect(
      findDeadConnectConfig(config, entries, "dev", WHERE).map((w) => w.path),
    ).toEqual(["drives.allowAddDrive", "app.studioMode"]);
    expect(
      findDeadConnectConfig(config, entries, "serve", WHERE).map((w) => w.path),
    ).toEqual(["app.studioMode"]);
  });

  it("skips values that already equal what Connect serves", () => {
    expect(
      findDeadConnectConfig(
        {
          drives: {
            allowAddDrive: false,
            icons: null,
            sections: {
              remote: { enabled: false, allowAdd: false, allowDelete: false },
              local: { allowDelete: false, allowAdd: false, enabled: false },
            },
          },
          sentry: { dsn: null, env: "dev" },
          ai: { assistantEnabled: false },
        },
        [],
        "dev",
        WHERE,
      ),
    ).toEqual([]);
  });

  it("reports every live slice of an absent plugin; presence-only slices hint at composing it", () => {
    const warnings = findDeadConnectConfig(
      {
        drives: {
          sections: { remote: { enabled: true } },
          icons: { folder: "./f.svg" },
        },
        home: { background: "./home.png" },
        sentry: { dsn: "https://k@s/1" },
        ai: { assistantEnabled: true },
        app: { workflowsEnabled: true },
      },
      [],
      "dev",
      WHERE,
    );
    expect(warnings.map((w) => [w.path, w.owner])).toEqual([
      ["drives.sections", GENERIC],
      ["drives.icons", GENERIC],
      ["home.background", GENERIC],
      ["sentry.dsn", "@powerhousedao/connect/plugins/sentry"],
      ["ai.assistantEnabled", "@powerhousedao/connect/plugins/assistant"],
      ["app.workflowsEnabled", WORKFLOWS],
    ]);
    expect(warnings.at(-1)?.message).toContain(
      `Hint: compose "${WORKFLOWS}" (presence is the switch), or delete the value.`,
    );
  });

  it("treats OpenPanel tracking as inert without a clientId", () => {
    const defaults = {
      openPanel: { clientId: "", trackUiEvents: true, trackOperations: true },
    };
    expect(findDeadConnectConfig(defaults, [], "dev", WHERE)).toEqual([]);
    expect(
      findDeadConnectConfig(
        { openPanel: { clientId: "abc", trackUiEvents: true } },
        [],
        "dev",
        WHERE,
      ).map((w) => w.path),
    ).toEqual(["openPanel.clientId", "openPanel.trackUiEvents"]);
  });

  it("keeps the gate slice of an inertUnless plugin in its own slice list", () => {
    for (const { slices, inertUnless } of Object.values(
      CONNECT_PLUGIN_OWNED_SLICES,
    )) {
      if (inertUnless === undefined) continue;
      expect(slices.map((slice) => slice.path)).toContain(inertUnless);
    }
  });
});
