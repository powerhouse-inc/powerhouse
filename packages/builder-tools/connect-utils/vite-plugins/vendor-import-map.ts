// Merge the production vendor's import-map entries into the page's
// `<script type="importmap">`. Build-only.
//
// Connect already self-hosts React: `reactSelfHostPlugin` (registered before
// this plugin) returns an import-map tag, which Vite injects into the HTML
// string before the next transformIndexHtml hook runs. So by the time this
// hook sees the HTML, the React map is an inline script — we merge the
// vendor entries into it. If no import map exists (a consumer disabled
// react self-host), we inject one.
import type { HtmlTagDescriptor, Plugin } from "vite";

export type VendorImportMapOptions = {
  /** bare specifier -> URL (already base-prefixed by the caller). */
  imports: Record<string, string>;
};

// Pull the `imports` table out of a parsed import-map document without
// trusting its shape: anything that isn't a string specifier->string value
// is ignored, and malformed documents yield an empty table instead of a
// throw.
function extractImports(raw: unknown): Record<string, string> {
  if (typeof raw !== "object" || raw === null) return {};
  const imports = "imports" in raw ? raw.imports : undefined;
  if (typeof imports !== "object" || imports === null) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(imports)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function parseImportMap(raw: string): Record<string, string> {
  try {
    return extractImports(JSON.parse(raw));
  } catch {
    return {};
  }
}

const INLINE_IMPORTMAP = /<script type="importmap">([\s\S]*?)<\/script>/;

export function vendorImportMapPlugin(options: VendorImportMapOptions): Plugin {
  const vendorEntries = Object.keys(options.imports).length;
  return {
    name: "ph-vendor-import-map",
    apply: "build",
    transformIndexHtml(html) {
      if (!vendorEntries) return;

      // Merge into the existing map (the react self-host one, or a
      // consumer-provided one). Vendor entries win on specifier conflicts.
      const match = INLINE_IMPORTMAP.exec(html);
      if (match) {
        const merged = {
          imports: { ...parseImportMap(match[1]), ...options.imports },
        };
        return html.replace(
          INLINE_IMPORTMAP,
          `<script type="importmap">${JSON.stringify(merged)}</script>`,
        );
      }

      // No map at all: inject one (head-prepend, the same position the
      // react map uses).
      const injected: HtmlTagDescriptor = {
        tag: "script",
        attrs: { type: "importmap" },
        children: JSON.stringify({ imports: options.imports }),
        injectTo: "head-prepend",
      };
      return [injected];
    },
  };
}
