import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import createAssistantPlugin from "../plugins/assistant.js";
import createGenericPlugin from "../plugins/generic.js";
import createOpenPanelPlugin from "../plugins/openpanel.js";
import createSentryPlugin from "../plugins/sentry.js";
import type { ConnectPluginFactory } from "@powerhousedao/connect-core/plugins";
import createVetraStudioPlugin from "../plugins/vetra-studio.js";
import createWorkflowsPlugin from "../plugins/workflows.js";
import { connectPluginConfigSchemas } from "./index.js";

// `@powerhousedao/connect/plugin-configs` carries every built-in plugin's
// entry config schema without the plugins. It must not drift from the
// schemas the plugins validate with, and must stay zod-only.

const factories: Record<string, [ConnectPluginFactory, unknown]> = {
  "@powerhousedao/connect/plugins/assistant": [createAssistantPlugin, {}],
  "@powerhousedao/connect/plugins/generic": [
    createGenericPlugin,
    { allowAddDrive: true, icons: null, homeBackground: null },
  ],
  "@powerhousedao/connect/plugins/openpanel": [createOpenPanelPlugin, {}],
  "@powerhousedao/connect/plugins/sentry": [createSentryPlugin, {}],
  "@powerhousedao/vetra-studio/connect": [createVetraStudioPlugin, {}],
  "@powerhousedao/connect/plugins/workflows": [createWorkflowsPlugin, {}],
};

describe("@powerhousedao/connect/plugin-configs", () => {
  it("has one schema per built-in plugin, the one the plugin validates with", () => {
    expect(Object.keys(connectPluginConfigSchemas).sort()).toEqual(
      Object.keys(factories).sort(),
    );
    for (const [specifier, [factory, config]] of Object.entries(factories)) {
      const plugin = factory(config as Record<string, unknown>);
      expect(
        plugin.configSchema,
        `${specifier}: plugin configSchema is the entry's schema`,
      ).toBe(
        connectPluginConfigSchemas[
          specifier as keyof typeof connectPluginConfigSchemas
        ],
      );
    }
  });

  it("rejects a typo'd key", () => {
    const parsed = connectPluginConfigSchemas[
      "@powerhousedao/connect/plugins/generic"
    ].safeParse({ allowAddDrives: true });
    expect(parsed.success).toBe(false);
  });

  it("imports only zod and zod-only schema entries", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const allowed = new Set([
      "zod",
      "@powerhousedao/shared/connect/connect-config-schema",
      "@powerhousedao/host-core/schema",
    ]);
    const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const code = readFileSync(path.join(dir, file), "utf8");
      for (const [, specifier] of code.matchAll(IMPORT)) {
        if (specifier.startsWith("./")) continue;
        expect(allowed, `${file} imports "${specifier}"`).toContain(specifier);
      }
    }
  });
});
