import { describe, expect, it } from "vitest";
import type { HtmlTagDescriptor, Plugin } from "vite";
import {
  vendorImportMapPlugin,
  type VendorImportMapOptions,
} from "./vendor-import-map.js";

const REACT_MAP = JSON.stringify({
  imports: {
    react: "/__react__/react.js",
    "react/": "/__react__/react/",
  },
});

const VENDOR: VendorImportMapOptions = {
  imports: {
    "document-model": "/__vendor__/document-model.js",
    zod: "/__vendor__/zod.js",
  },
};

// Mirrors what the Vite html plugin produces after injecting the react
// self-host map (head-prepend): an inline import-map script at the top of
// <head>.
function htmlWithImportMap(json: string): string {
  return `<!doctype html><html><head><script type="importmap">${json}</script></head><body></body></html>`;
}

// The vite hook type carries a plugin-context `this` (a large rolldown
// interface); the hook under test never touches it, so re-type the handler
// without it.
type PlainHtmlTransform = (
  html: string,
  ctx: { path: string; filename: string },
) =>
  | string
  | HtmlTagDescriptor[]
  | void
  | Promise<string | HtmlTagDescriptor[] | void>;

async function runTransform(plugin: Plugin, html: string): Promise<string> {
  const hook = plugin.transformIndexHtml;
  expect(hook).toBeTruthy();
  if (!hook) throw new Error("plugin has no transformIndexHtml");
  const hookFn = typeof hook === "function" ? hook : hook.handler;
  const fn = hookFn as unknown as PlainHtmlTransform;
  const out = await fn(html, { path: "/index.html", filename: "index.html" });
  if (out === undefined) return html; // vite: `continue`
  if (typeof out === "string") return out;
  if (Array.isArray(out)) {
    // Vite injects returned tags into the HTML immediately; emulate that
    // here for the no-map case (head-prepend).
    const serialized = out
      .map(
        (t) =>
          `<${t.tag} type="importmap">${
            typeof t.children === "string" ? t.children : ""
          }</${t.tag}>`,
      )
      .join("");
    return html.replace("<head>", `<head>${serialized}`);
  }
  throw new Error(`unexpected hook result: ${String(out)}`);
}

function readImportMap(html: string): Record<string, string> {
  const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  expect(match).toBeTruthy();
  const parsed: unknown = JSON.parse(match![1]);
  if (typeof parsed !== "object" || parsed === null) throw new Error("bad map");
  const imports = "imports" in parsed ? parsed.imports : undefined;
  if (typeof imports !== "object" || imports === null)
    throw new Error("bad map");
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(imports)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

describe("vendorImportMapPlugin", () => {
  it("merges vendor entries into the react self-host map", async () => {
    const out = await runTransform(
      vendorImportMapPlugin(VENDOR),
      htmlWithImportMap(REACT_MAP),
    );
    expect(readImportMap(out)).toEqual({
      react: "/__react__/react.js",
      "react/": "/__react__/react/",
      "document-model": "/__vendor__/document-model.js",
      zod: "/__vendor__/zod.js",
    });
  });

  it("lets a vendor entry win a specifier conflict", async () => {
    const conflictMap = JSON.stringify({
      imports: { zod: "/somewhere-else/zod.js", react: "/__react__/react.js" },
    });
    const out = await runTransform(
      vendorImportMapPlugin(VENDOR),
      htmlWithImportMap(conflictMap),
    );
    const merged = readImportMap(out);
    expect(merged.zod).toBe("/__vendor__/zod.js");
    expect(merged.react).toBe("/__react__/react.js");
  });

  it("injects an import map when none exists", async () => {
    const out = await runTransform(
      vendorImportMapPlugin(VENDOR),
      "<!doctype html><html><head><title>x</title></head><body></body></html>",
    );
    expect(readImportMap(out)).toEqual(VENDOR.imports);
  });

  it("is a no-op when it has no entries", async () => {
    const html = htmlWithImportMap(REACT_MAP);
    const out = await runTransform(
      vendorImportMapPlugin({ imports: {} }),
      html,
    );
    expect(out).toBe(html);
  });

  it("tolerates a malformed existing map without throwing", async () => {
    const out = await runTransform(
      vendorImportMapPlugin(VENDOR),
      htmlWithImportMap("{not json"),
    );
    expect(readImportMap(out)).toEqual(VENDOR.imports);
  });
});
