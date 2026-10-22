import type { PluginEntry } from "@powerhousedao/host-core";
import { describe, expect, it } from "vitest";
import { attachmentsPlugin } from "../src/plugins/attachments.mjs";
import { mcpPlugin } from "../src/plugins/mcp.mjs";
import { privacyPlugin } from "../src/plugins/privacy.mjs";
import { workflowsPlugin } from "../src/plugins/workflows.mjs";

// typed-host-configs 1.4 / T2 lane C: every built-in switchboard plugin
// declares a zod configSchema, and its module augments PHPluginConfigs so a
// host.js entry's config is typed by specifier.

/** The typed object form of a known specifier's entry. (The bare-string form
 * and the untyped `{ module: string }` fallback do not narrow by specifier.) */
type EntryFor<M extends string> = Extract<PluginEntry, { module: M }>;

describe("switchboard plugin configSchemas", () => {
  it.each([
    ["mcp", mcpPlugin],
    ["attachments", attachmentsPlugin],
    ["privacy", privacyPlugin],
  ])("%s takes no config: {} passes, any key is a typo", (_, plugin) => {
    expect(plugin.configSchema?.safeParse({}).success).toBe(true);
    expect(plugin.configSchema?.safeParse({ enabled: true }).success).toBe(
      false,
    );
  });

  it("workflows rejects a typo'd key and accepts drive: false", () => {
    expect(
      workflowsPlugin.configSchema?.safeParse({ drive: false }).success,
    ).toBe(true);
    expect(
      workflowsPlugin.configSchema?.safeParse({ drives: false }).success,
    ).toBe(false);
  });
});

describe("PHPluginConfigs augmentation (type level)", () => {
  it("types the switchboard workflows entry: drive is { slug, name, … } | false", () => {
    const entries: PluginEntry[] = [
      "@powerhousedao/switchboard/plugins/mcp",
      {
        module: "@powerhousedao/switchboard/plugins/workflows",
        config: { drive: { slug: "workflows", name: "Workflows" } },
      },
      {
        module: "@powerhousedao/switchboard/plugins/workflows",
        config: { drive: false },
      },
    ];
    // Positive cases pin that the entry type exists (not `never`), so the
    // expect-errors below fail for the right reason.
    const declared: EntryFor<"@powerhousedao/switchboard/plugins/workflows"> = {
      module: "@powerhousedao/switchboard/plugins/workflows",
      config: { drive: { slug: "flows", name: "Flows" } },
    };
    const off: PHPluginConfigs["@powerhousedao/switchboard/plugins/workflows"] =
      { drive: false };
    const urlDrive: EntryFor<"@powerhousedao/switchboard/plugins/workflows"> = {
      module: "@powerhousedao/switchboard/plugins/workflows",
      // @ts-expect-error -- the switchboard workflows drive is a declaration, not a URL (that is Connect's)
      config: { drive: "http://localhost:4001/d/workflows" },
    };
    const typo: EntryFor<"@powerhousedao/switchboard/plugins/workflows"> = {
      module: "@powerhousedao/switchboard/plugins/workflows",
      // @ts-expect-error -- `drives` is not a workflows config key
      config: { drives: false },
    };
    expect([entries, declared, off, urlDrive, typo]).toBeDefined();
  });

  it("types the no-config plugins as taking no keys", () => {
    const mcp: PHPluginConfigs["@powerhousedao/switchboard/plugins/mcp"] = {
      // @ts-expect-error -- mcp takes no config
      enabled: true,
    };
    const none: PHPluginConfigs["@powerhousedao/switchboard/plugins/privacy"] =
      {};
    const attachments: EntryFor<"@powerhousedao/switchboard/plugins/attachments"> =
      { module: "@powerhousedao/switchboard/plugins/attachments", config: {} };
    expect([mcp, none, attachments]).toBeDefined();
  });
});
