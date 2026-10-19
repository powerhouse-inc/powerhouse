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

/** Runs the boot script against a stand-in page with a controllable OS theme. */
function runBootScript(options: { dark: boolean; saved?: string }) {
  const script = runTransform(HTML)?.tags[0]?.children ?? "";
  const classes = new Set<string>();
  const storage = new Map<string, string>();
  if (options.saved) storage.set("ph:theme", options.saved);
  const listeners: (() => void)[] = [];
  const frames: (() => void)[] = [];
  const media = {
    matches: options.dark,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.push(listener);
    },
  };
  const page = {
    location: { search: "" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    matchMedia: () => media,
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    document: {
      documentElement: {
        classList: {
          toggle: (name: string, on: boolean) =>
            on ? classes.add(name) : classes.delete(name),
        },
      },
    },
  };
  // oxlint-disable-next-line typescript/no-implied-eval -- the injected script, on a stand-in page
  const boot = new Function(...Object.keys(page), script) as (
    ...globals: unknown[]
  ) => void;
  boot(...Object.values(page));
  return {
    storage,
    isDark: () => classes.has("dark"),
    setOsDark(dark: boolean) {
      media.matches = dark;
      for (const listener of listeners) listener();
    },
    setOsDarkSilently(dark: boolean) {
      media.matches = dark;
    },
    nextFrame: () => frames.splice(0).forEach((frame) => frame()),
  };
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

  it("follows the OS preference as it settles after boot when no theme is saved", () => {
    const page = runBootScript({ dark: true });
    expect(page.isDark()).toBe(true);
    page.setOsDark(false);
    expect(page.isDark()).toBe(false);
  });

  it("re-checks the OS preference on the first frame", () => {
    const page = runBootScript({ dark: true });
    page.setOsDarkSilently(false);
    page.nextFrame();
    expect(page.isDark()).toBe(false);
  });

  it("keeps a saved theme, and a choice made after boot, over OS changes", () => {
    const saved = runBootScript({ dark: false, saved: "dark" });
    saved.setOsDark(true);
    saved.setOsDark(false);
    expect(saved.isDark()).toBe(true);

    const chosen = runBootScript({ dark: false });
    chosen.storage.set("ph:theme", "light");
    chosen.setOsDark(true);
    expect(chosen.isDark()).toBe(false);
  });

  it("skips documents that already carry the marker", () => {
    const withMarker = HTML.replace(
      "<head>",
      `<head><script ${THEME_BOOT_MARKER}>/* preset */</script>`,
    );
    expect(runTransform(withMarker)).toBeUndefined();
  });
});
