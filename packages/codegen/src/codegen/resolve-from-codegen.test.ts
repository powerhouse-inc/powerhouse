import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { describe, expect, it } from "vitest";
import { loadCodegenPlugin } from "./resolve-from-codegen.js";

// The dev switchboard's Vite loader runs this package itself in the monorepo,
// where it is linked. A plugin loaded with `import()` of its file URL then went
// to Vite, which cannot run the plugin's CommonJS.
describe("loadCodegenPlugin", () => {
  it("loads a plugin with its plugin function when a Vite module runner runs this module", async () => {
    const vite = await createServer({
      root: fileURLToPath(new URL("../..", import.meta.url)),
      configFile: false,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true, hmr: false, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    try {
      const loader = (await vite.ssrLoadModule(
        fileURLToPath(new URL("./resolve-from-codegen.ts", import.meta.url)),
      )) as { loadCodegenPlugin: typeof loadCodegenPlugin };

      const plugin = (await loader.loadCodegenPlugin(
        "@graphql-codegen/typescript",
      )) as { plugin?: unknown };

      expect(typeof plugin.plugin).toBe("function");
    } finally {
      await vite.close();
    }
  });

  it("rejects a name it cannot resolve, so graphql-codegen tries the next", async () => {
    await expect(
      loadCodegenPlugin("codegen-no-such-plugin"),
    ).rejects.toMatchObject({ code: "MODULE_NOT_FOUND" });
  });
});
