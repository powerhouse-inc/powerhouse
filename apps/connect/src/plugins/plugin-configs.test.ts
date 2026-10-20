import type {
  PluginEntry,
  PluginEntryData,
} from "@powerhousedao/host-core/plugins";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { describe, expect, it } from "vitest";
import createAssistantPlugin from "./assistant.js";
import createGenericPlugin from "./generic.js";
import createOpenPanelPlugin from "./openpanel.js";
import createSentryPlugin from "./sentry.js";
import type { ConnectPluginFactory } from "./types.js";
import createVetraStudioPlugin from "./vetra-studio.js";
import createWorkflowsPlugin, {
  workflowsConnectConfigSchema,
} from "./workflows.js";

// typed-host-configs 1.4 / 1.6, T2 lane C: every built-in Connect plugin
// declares a strict zod configSchema (typo'd keys fail) and augments
// PHPluginConfigs under its specifier.

/** The typed object form of a known specifier's entry. (The bare-string form
 * and the untyped `{ module: string }` fallback do not narrow by specifier.) */
type EntryFor<M extends string> = Extract<PluginEntry, { module: M }>;

const factories: [string, ConnectPluginFactory, Record<string, unknown>][] = [
  [
    "generic",
    createGenericPlugin,
    { allowAddDrive: false, sections: { local: { enabled: false } } },
  ],
  ["sentry", createSentryPlugin, { dsn: "https://k@sentry.example/1" }],
  ["openpanel", createOpenPanelPlugin, { clientId: "abc" }],
  ["assistant", createAssistantPlugin, {}],
  ["vetra-studio", createVetraStudioPlugin, {}],
  ["workflows", createWorkflowsPlugin, { drive: "http://x/d/workflows" }],
];

describe("Connect plugin configSchemas", () => {
  it.each(factories)(
    "%s accepts its config and rejects a typo'd key",
    (_, factory, valid) => {
      const plugin = factory(valid);
      expect(plugin.configSchema?.safeParse(valid).success).toBe(true);
      expect(
        plugin.configSchema?.safeParse({ ...valid, typo: 1 }).success,
      ).toBe(false);
      expect(() => factory({ ...valid, typo: 1 })).toThrow();
    },
  );

  it("names the plugin and the offending key when an entry config is invalid", () => {
    expect(() => createGenericPlugin({ allowAddDrives: false })).toThrow(
      /Connect plugin "@powerhousedao\/connect\/plugins\/generic" is invalid:[\s\S]*allowAddDrives/,
    );
  });

  it("generic types its slices by the Connect config schema", () => {
    const schema = createGenericPlugin({}).configSchema!;
    expect(
      schema.safeParse({
        allowAddDrive: true,
        sections: { remote: { allowAdd: false }, local: { enabled: true } },
        icons: { folder: "./icons/folder.svg", documents: { "a/b": "x.png" } },
        homeBackground: "./home.png",
      }).success,
    ).toBe(true);
    // the shape the Connect build leaves after resolving images to data URIs
    // (mapBackgroundImages keeps each layer, swapping only its src)
    expect(
      schema.safeParse({
        homeBackground: {
          color: { light: "#fff", dark: "#000" },
          layers: [
            {
              src: { light: "data:image/png;base64,AA==", dark: "data:x" },
              position: { right: 0, bottom: 0 },
              width: "40%",
              opacity: 0.8,
            },
          ],
        },
        icons: null,
      }).success,
    ).toBe(true);
    // nested typos fail too: the slice schemas are strict
    expect(
      schema.safeParse({ sections: { remote: { allowAd: false } } }).success,
    ).toBe(false);
    expect(schema.safeParse({ icons: { folders: "x" } }).success).toBe(false);
    expect(schema.safeParse({ allowAddDrive: "yes" }).success).toBe(false);
  });

  it("sentry and openpanel merge their validated config into their slice", () => {
    const served: PHConnectRuntimeConfig = {
      sentry: { dsn: null, env: "dev" },
      openPanel: { clientId: "", trackUiEvents: true },
    };
    const sentry = createSentryPlugin({ dsn: "https://k@s/1" });
    const openPanel = createOpenPanelPlugin({
      clientId: "abc",
      trackOperations: false,
    });
    const ctx = { entryConfig: {} };
    const out = openPanel.hooks!.transformConnectConfig!(
      sentry.hooks!.transformConnectConfig!(served, ctx),
      ctx,
    );
    expect(out.sentry).toEqual({ dsn: "https://k@s/1", env: "dev" });
    expect(out.openPanel).toEqual({
      clientId: "abc",
      trackUiEvents: true,
      trackOperations: false,
    });
  });

  it("workflows takes a URL or an output token, not the switchboard's drive declaration", () => {
    const schema = createWorkflowsPlugin({}).configSchema!;
    expect(
      schema.safeParse({ drive: "http://127.0.0.1:4001/d/workflows" }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        drive: {
          $output: {
            host: "switchboard",
            path: ["drives", "workflows", "url"],
          },
        },
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ drive: "workflows" }).success).toBe(false);
    expect(
      schema.safeParse({ drive: { slug: "workflows", name: "Workflows" } })
        .success,
    ).toBe(false);
  });

  it("workflows rejects the removed { from, slug } reference naming the token form", () => {
    const result = workflowsConnectConfigSchema.safeParse({
      drive: { from: "switchboard", slug: "workflows" },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["drive"],
        message: expect.stringMatching(
          /drive: \{ from, slug \} was removed; use switchboard\.drives\.workflows\.url from \.\.\/switchboard\/outputs\.js, or \{ \$output: \{ host: "switchboard", path: \["drives", "workflows", "url"\] \} \}/,
        ) as unknown,
      }),
    ]);
    // The browser factory fails the same way, naming the plugin.
    expect(() =>
      createWorkflowsPlugin({
        drive: { from: "switchboard", slug: "workflows" },
      }),
    ).toThrow(
      /@powerhousedao\/connect\/plugins\/workflows[\s\S]*\{ from, slug \} was removed/,
    );
  });
});

describe("PHPluginConfigs augmentation (type level)", () => {
  it("types each Connect plugin's entry config by specifier", () => {
    // Positive cases pin that the entry types exist (not `never`), so the
    // expect-errors below fail for the right reason.
    const generic: EntryFor<"@powerhousedao/connect/plugins/generic"> = {
      module: "@powerhousedao/connect/plugins/generic",
      config: { allowAddDrive: false, icons: null },
    };
    const workflows: EntryFor<"@powerhousedao/connect/plugins/workflows"> = {
      module: "@powerhousedao/connect/plugins/workflows",
      config: { drive: "http://localhost:4001/d/workflows" },
    };
    const sentry: PHPluginConfigs["@powerhousedao/connect/plugins/sentry"] = {
      dsn: null,
    };
    const studio: EntryFor<"@powerhousedao/vetra-studio/connect"> = {
      module: "@powerhousedao/vetra-studio/connect",
      verbs: ["dev"],
    };

    // `drive` is ref(z.url()): a URL or an output token, never the
    // switchboard's drive declaration.
    const token: EntryFor<"@powerhousedao/connect/plugins/workflows"> = {
      module: "@powerhousedao/connect/plugins/workflows",
      config: {
        drive: {
          $output: {
            host: "switchboard",
            path: ["drives", "workflows", "url"],
          },
        },
      },
    };
    const declaration: EntryFor<"@powerhousedao/connect/plugins/workflows"> = {
      module: "@powerhousedao/connect/plugins/workflows",
      // @ts-expect-error -- Connect's workflows drive is a URL or token, not the switchboard's { slug, name } declaration
      config: { drive: { slug: "workflows", name: "Workflows" } },
    };
    const typo: EntryFor<"@powerhousedao/connect/plugins/generic"> = {
      module: "@powerhousedao/connect/plugins/generic",
      // @ts-expect-error -- `allowAddDrives` is not a generic config key
      config: { allowAddDrives: false },
    };
    const assistant: PHPluginConfigs["@powerhousedao/connect/plugins/assistant"] =
      {
        // @ts-expect-error -- the assistant takes no config
        endpoint: "http://x",
      };

    // The typed configs stay assignable to the runtime entry shape that
    // normalizePluginEntries takes (the type-alias rule from T1).
    const runtime: PluginEntryData[] = [generic, workflows, studio];
    expect([
      sentry,
      token,
      declaration,
      typo,
      assistant,
      runtime,
    ]).toBeDefined();
  });
});
