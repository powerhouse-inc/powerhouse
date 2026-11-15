import { describe, expect, it } from "vitest";
import {
  CONNECT_PLUGIN_OWNED_SLICES,
  defaultConnectComposition,
} from "../src/plugins-resolve.js";

// A Connect host without `runner.plugins` is served this composition. It has
// to leave the config as Connect serves it with none; a Connect test
// (apps/connect/src/plugins/default-composition.test.ts) holds it to that
// against the built-ins themselves.

const GENERIC = "@powerhousedao/connect/plugins/generic";
const SENTRY = "@powerhousedao/connect/plugins/sentry";
const OPENPANEL = "@powerhousedao/connect/plugins/openpanel";
const ASSISTANT = "@powerhousedao/connect/plugins/assistant";
const STUDIO = "@powerhousedao/vetra-studio/connect";
const WORKFLOWS = "@powerhousedao/connect/plugins/workflows";

const modules = (config: Record<string, unknown> | undefined) =>
  defaultConnectComposition(config).map((entry) => entry.module);

describe("defaultConnectComposition", () => {
  it("has the built-ins configured through their entry, and no switch, for an empty config", () => {
    for (const config of [undefined, {}]) {
      expect(defaultConnectComposition(config)).toEqual([
        { module: GENERIC, config: {} },
        { module: SENTRY, config: {} },
        { module: OPENPANEL, config: {} },
      ]);
    }
  });

  it("hands the generic plugin the chrome values the config holds", () => {
    const sections = {
      remote: { enabled: false, allowAdd: false, allowDelete: false },
      local: { enabled: true, allowAdd: true, allowDelete: false },
    };
    const [generic] = defaultConnectComposition({
      drives: {
        allowAddDrive: false,
        sections,
        icons: { folder: "./folder.svg" },
        defaultDrives: [],
      },
      home: { background: "./home.png" },
    });
    expect(generic).toEqual({
      module: GENERIC,
      config: {
        allowAddDrive: false,
        sections,
        icons: { folder: "./folder.svg" },
        homeBackground: "./home.png",
      },
    });
  });

  it("leaves out a value the config resets to its default", () => {
    const [generic, sentry] = defaultConnectComposition({
      drives: { icons: null },
      home: { background: null },
      sentry: { dsn: null, env: "dev" },
    });
    expect(generic.config).toEqual({});
    expect(sentry.config).toEqual({});
  });

  it("hands Sentry and OpenPanel the values of the slices they own", () => {
    const composition = defaultConnectComposition({
      sentry: { dsn: "https://k@sentry.example/1", env: "prod" },
      openPanel: { clientId: "abc", trackUiEvents: false },
    });
    expect(composition.slice(1)).toEqual([
      { module: SENTRY, config: { dsn: "https://k@sentry.example/1" } },
      { module: OPENPANEL, config: { clientId: "abc", trackUiEvents: false } },
    ]);
  });

  it.each([
    [ASSISTANT, { ai: { assistantEnabled: true } }],
    [STUDIO, { app: { studioMode: true } }],
    [WORKFLOWS, { app: { workflowsEnabled: true } }],
  ])("composes %s in only where the config has it on", (module, on) => {
    expect(modules(on)).toContain(module);
    const [slice] = CONNECT_PLUGIN_OWNED_SLICES[module].slices;
    const [block, key] = slice.path.split(".");
    expect(modules({ [block]: { [key]: false } })).not.toContain(module);
    expect(modules({ [block]: {} })).not.toContain(module);
  });

  it("composes every switch in when all are on", () => {
    expect(
      modules({
        ai: { assistantEnabled: true },
        app: { studioMode: true, workflowsEnabled: true },
      }),
    ).toEqual([GENERIC, SENTRY, OPENPANEL, ASSISTANT, STUDIO, WORKFLOWS]);
  });
});
