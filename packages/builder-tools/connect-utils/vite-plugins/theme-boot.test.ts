import { describe, expect, it } from "vitest";
import { connectThemeBootPlugin, THEME_BOOT_MARKER } from "./theme-boot.js";

type TransformResult =
  | {
      html: string;
      tags: {
        tag: string;
        attrs: Record<string, string>;
        children: string;
        injectTo: string;
      }[];
    }
  | undefined;

/** Drives the plugin's transformIndexHtml hook. */
function runTransform(html: string): TransformResult {
  const plugin = connectThemeBootPlugin();
  const transform = plugin.transformIndexHtml as unknown as (
    html: string,
  ) => TransformResult;
  return transform(html);
}

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`;

describe("connectThemeBootPlugin", () => {
  it("prepends a marked boot script to <head>", () => {
    const result = runTransform(HTML);
    expect(result).toBeDefined();
    expect(result?.tags).toHaveLength(1);
    const tag = result?.tags[0];
    expect(tag?.tag).toBe("script");
    expect(tag?.injectTo).toBe("head-prepend");
    expect(tag?.attrs).toHaveProperty(THEME_BOOT_MARKER);
    // Persists ?theme= into ph:theme, honors system preference, toggles .dark.
    expect(tag?.children).toContain(`localStorage.setItem('ph:theme',p)`);
    expect(tag?.children).toContain("prefers-color-scheme: dark");
    expect(tag?.children).toContain(`classList.toggle('dark',d)`);
  });

  it("skips documents that already carry the marker", () => {
    const withMarker = HTML.replace(
      "<head>",
      `<head><script ${THEME_BOOT_MARKER}>/* preset */</script>`,
    );
    expect(runTransform(withMarker)).toBeUndefined();
  });
});
