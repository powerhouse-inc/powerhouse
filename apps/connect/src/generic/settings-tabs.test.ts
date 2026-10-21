import { primeRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import type { RuntimePowerhouseConfig } from "@powerhousedao/shared/connect";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ph build reads this list: a project file at one of these paths is an override.
const generic = JSON.parse(
  readFileSync(new URL("../../generic-routes.json", import.meta.url), "utf8"),
) as { appRoutes: string[] };

describe("the generic plugin's code routes", () => {
  // A project route spreading a tab evaluates this with the route tree, before Connect loads its config.
  it("import before the runtime config loads", async () => {
    const { genericSettingsTabs } = await import("./settings-tabs.js");
    expect(genericSettingsTabs.about.staticData.settings.label).toBe("About");
  });

  it("are listed in generic-routes.json for ph build", async () => {
    primeRuntimeConfig({
      connect: DEFAULT_CONNECT_CONFIG,
    } as RuntimePowerhouseConfig);
    const { genericSettingsTabs } = await import("./settings-tabs.js");
    expect(generic.appRoutes).toEqual(
      Object.keys(genericSettingsTabs).map((path) => `settings/${path}`),
    );
    const ai = genericSettingsTabs["ai-assistant"].staticData.settings;
    expect(ai.enabled?.({} as never)).toBe(false);
  });
});
