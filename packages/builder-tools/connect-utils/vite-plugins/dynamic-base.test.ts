import { describe, expect, it, vi } from "vitest";
import {
  connectDynamicBasePlugin,
  DYNAMIC_BASE_PLACEHOLDER,
} from "./dynamic-base.js";

const BASE_EXPR = `(globalThis.__PH_DYNAMIC_BASE__||"/")`;

type RenderChunkResult = {
  code: string;
  map: { version: number; mappings: string };
} | null;

/** Drives the plugin's renderChunk hook with a minimal mock context. */
function runRenderChunk(
  code: string,
  options: { forWorker?: boolean } = {},
): RenderChunkResult {
  const ctx = { info: vi.fn() };
  const plugin = connectDynamicBasePlugin(options);
  const renderChunk = plugin.renderChunk as unknown as (
    this: typeof ctx,
    code: string,
    chunk: { fileName: string },
  ) => RenderChunkResult;
  return renderChunk.call(ctx, code, { fileName: "assets/index.js" });
}

/** Drives the plugin's generateBundle hook with a minimal mock context. */
function runGenerateBundle(bundle: Record<string, unknown>) {
  const error = vi.fn((msg: string) => {
    throw new Error(msg);
  });
  const ctx = { error, info: vi.fn() };
  const plugin = connectDynamicBasePlugin();
  const generateBundle = plugin.generateBundle as unknown as (
    this: typeof ctx,
    options: unknown,
    bundle: Record<string, unknown>,
  ) => void;
  generateBundle.call(ctx, {}, bundle);
  return { error };
}

describe("connectDynamicBasePlugin renderChunk rewrite", () => {
  it("rewrites a double-quoted literal", () => {
    expect(
      runRenderChunk(
        `new URL("${DYNAMIC_BASE_PLACEHOLDER}assets/x.png", import.meta.url)`,
      )?.code,
    ).toBe(`new URL((${BASE_EXPR}+"assets/x.png"), import.meta.url)`);
  });

  it("rewrites a single-quoted literal", () => {
    expect(
      runRenderChunk(`fetch('${DYNAMIC_BASE_PLACEHOLDER}ph-packages.json')`)
        ?.code,
    ).toBe(`fetch((${BASE_EXPR}+"ph-packages.json"))`);
  });

  it("rewrites a backtick literal without interpolation", () => {
    expect(
      runRenderChunk("load(`" + DYNAMIC_BASE_PLACEHOLDER + "assets/chunk.js`)")
        ?.code,
    ).toBe(`load((${BASE_EXPR}+"assets/chunk.js"))`);
  });

  it("rewrites a double-quoted literal containing an apostrophe without corruption", () => {
    expect(
      runRenderChunk(`u("${DYNAMIC_BASE_PLACEHOLDER}it's.png")`)?.code,
    ).toBe(`u((${BASE_EXPR}+"it's.png"))`);
  });

  it("rewrites the bare placeholder (inlined BASE_URL) to the bare expression", () => {
    expect(
      runRenderChunk(`const base = "${DYNAMIC_BASE_PLACEHOLDER}";`)?.code,
    ).toBe(`const base = ${BASE_EXPR};`);
  });

  it("leaves an interpolated template literal unrewritten", () => {
    const code = "import(`" + DYNAMIC_BASE_PLACEHOLDER + "assets/${name}.js`)";
    expect(runRenderChunk(code)).toBeNull();
  });

  it("returns null for a chunk without the placeholder", () => {
    expect(runRenderChunk(`const x = "/static/";`)).toBeNull();
  });
});

describe("connectDynamicBasePlugin renderChunk sourcemaps", () => {
  it("returns a v3 hires map for a rewritten chunk", () => {
    const result = runRenderChunk(
      `const base = "${DYNAMIC_BASE_PLACEHOLDER}";\nfetch("${DYNAMIC_BASE_PLACEHOLDER}ph-packages.json");`,
    );
    expect(result).not.toBeNull();
    expect(result?.map.version).toBe(3);
    expect(result?.map.mappings.length).toBeGreaterThan(0);
    // No prelude: generated line 1 maps back to source line 1.
    expect(result?.map.mappings.startsWith(";")).toBe(false);
  });

  it("prepends the worker prelude and shifts the map by one line", () => {
    const result = runRenderChunk(
      `const base = "${DYNAMIC_BASE_PLACEHOLDER}";`,
      { forWorker: true },
    );
    expect(result?.code).toBe(
      `globalThis.__PH_DYNAMIC_BASE__=self.location.pathname.replace(/assets\\/[^/]*$/,"");\n` +
        `const base = ${BASE_EXPR};`,
    );
    // Prelude occupies generated line 1 with no source mapping, so the
    // mappings string starts with an empty line (leading ";").
    expect(result?.map.version).toBe(3);
    expect(result?.map.mappings.startsWith(";")).toBe(true);
  });
});

describe("connectDynamicBasePlugin generateBundle assertion", () => {
  it("leaves HTML assets untouched and passes a clean bundle", () => {
    const chunk = {
      type: "chunk",
      fileName: "assets/index.js",
      code: `const base = ${BASE_EXPR};`,
    };
    const html = {
      type: "asset",
      fileName: "index.html",
      source: `<script src="${DYNAMIC_BASE_PLACEHOLDER}assets/index.js"></script>`,
    };
    const { error } = runGenerateBundle({
      "assets/index.js": chunk,
      "index.html": html,
    });
    expect(html.source).toContain(DYNAMIC_BASE_PLACEHOLDER);
    expect(error).not.toHaveBeenCalled();
  });

  it("fails the build when a chunk retains the token (interpolated template)", () => {
    const chunk = {
      type: "chunk",
      fileName: "assets/index.js",
      code: "import(`" + DYNAMIC_BASE_PLACEHOLDER + "assets/${name}.js`)",
    };
    expect(() => runGenerateBundle({ "assets/index.js": chunk })).toThrow(
      /unrewritten placeholder.*assets\/index\.js/,
    );
  });

  it("fails the build when a CSS asset carries the token", () => {
    const css = {
      type: "asset",
      fileName: "assets/index.css",
      source: `body{background:url(${DYNAMIC_BASE_PLACEHOLDER}bg.png)}`,
    };
    expect(() => runGenerateBundle({ "assets/index.css": css })).toThrow(
      /unrewritten placeholder.*assets\/index\.css/,
    );
  });
});
