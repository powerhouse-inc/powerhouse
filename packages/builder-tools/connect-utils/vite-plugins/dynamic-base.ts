import MagicString from "magic-string";
import type { Plugin } from "vite";

/**
 * Placeholder base used when Connect is built in dynamic-base mode. The Vite
 * `base` option is set to this token; this plugin rewrites it in the emitted
 * output so the effective base is resolved at serve time from a global instead
 * of being baked at build time.
 *
 * Trailing slash matches `normalizeBasePath` output, so the token sits in the
 * same syntactic position as a concrete base would.
 */
export const DYNAMIC_BASE_PLACEHOLDER = "/__PH_DYNAMIC_BASE__/";

/**
 * Global the runtime (ph-clint proxy) must set before the entry bundle loads.
 * Value is the normalized deploy base, e.g. "/myagent/" or "/". The JS rewrite
 * below resolves all asset / lazy-chunk / BASE_URL references against it.
 */
const RUNTIME_GLOBAL = "globalThis.__PH_DYNAMIC_BASE__";

// `(globalThis.__PH_DYNAMIC_BASE__||"/")` — used everywhere the placeholder
// base prefix appears in emitted JS.
const BASE_EXPR = `(${RUNTIME_GLOBAL}||"/")`;

// Worker prelude: derive the deploy base in worker scope from the worker's own
// URL (proxy sets the global on the main thread only).
function workerPrelude(stripPrefix: string): string {
  // `stripPrefix` is the segment between the deploy base and `assets/` (default
  // "" → strip `assets/<file>`; vendor passes "__vendor__/").
  const prefix = escapeForRegExp(stripPrefix).replace(/\//g, "\\/");
  return `${RUNTIME_GLOBAL}=self.location.pathname.replace(/${prefix}assets\\/[^/]*$/,"");\n`;
}

// Match a string literal whose content STARTS with the placeholder, in any of
// the three JS quote styles Rolldown emits (double, single, backtick). Group 1
// captures the opening quote; the closing quote must be the same character
// (backreference), so a double-quoted literal may contain ' or ` and vice
// versa. Group 2 captures the literal text after the placeholder up to the
// closing quote. Rolldown emits the base both as a bare literal (the inlined
// BASE_URL) and as a `<base>`+suffix (preload/asset URL prefix); both start at
// the placeholder. The content stops at `$`, so a template literal that
// interpolates after the token (`` `<token>...${expr}` ``) is NOT rewritten —
// the residual-token assertion in `generateBundle` fails the build instead of
// shipping the raw placeholder.
const PLACEHOLDER_LITERAL = new RegExp(
  `(["'\`])${escapeForRegExp(DYNAMIC_BASE_PLACEHOLDER)}((?:(?!\\1)[^$])*)\\1`,
  "g",
);

/**
 * Rewrites the placeholder base in emitted JS chunks to a runtime expression so
 * one built `dist/connect` serves under any subpath. Rolldown-native: per-match
 * MagicString edits in `renderChunk`, no AST splicing (the SWC byte-offset
 * splicing in vite-plugin-dynamic-base corrupts Rolldown chunks). Each edited
 * chunk returns a hires sourcemap that the bundler composes into the chunk's
 * map chain, so the emitted `.map` files track the rewrite (and the worker
 * prelude's line shift).
 *
 * What gets rewritten in JS, all of which emit the base as a quoted string
 * literal beginning with the placeholder:
 *   - asset URLs (`new URL("/__PH_DYNAMIC_BASE__/assets/x.png", ...)`)
 *   - dynamic-import / lazy-chunk preload URLs
 *   - the inlined `import.meta.env.BASE_URL` (drives Connect's router basename
 *     and BASE_URL-relative fetches such as `${BASE_URL}ph-packages.json`)
 *
 * A literal `"/__PH_DYNAMIC_BASE__/foo"` becomes `((globalThis.__PH_DYNAMIC_BASE__||"/")+"foo")`;
 * a bare `"/__PH_DYNAMIC_BASE__/"` (the BASE_URL value) becomes `(globalThis.__PH_DYNAMIC_BASE__||"/")`.
 *
 * HTML is left untouched: the entry `<script>`/`<link>` tags keep the literal
 * placeholder so the proxy substitutes it with the concrete base at serve time
 * (the same proxy also sets the runtime global for the JS rewrite). See the
 * plugin's module doc / report for the exact serve-time contract.
 *
 * CSS `url(...)` references resolve relative to the stylesheet's own URL, so
 * they need no rewrite once the stylesheet itself is loaded from the right
 * prefix (which the HTML substitution handles).
 */
export function connectDynamicBasePlugin(
  options: { forWorker?: boolean; workerStripPrefix?: string } = {},
): Plugin {
  return {
    name: "ph-connect-dynamic-base",
    enforce: "post",
    renderChunk(code, chunk) {
      if (!code.includes(DYNAMIC_BASE_PLACEHOLDER)) return null;

      const s = new MagicString(code);
      for (const match of code.matchAll(PLACEHOLDER_LITERAL)) {
        const rest = match[2];
        s.overwrite(
          match.index,
          match.index + match[0].length,
          rest.length === 0
            ? BASE_EXPR
            : `(${BASE_EXPR}+${JSON.stringify(rest)})`,
        );
      }

      // Worker chunks run in their own global scope where the proxy never
      // sets the runtime global; derive it from the worker's script URL so
      // the rewritten references above resolve against the deploy base.
      if (options.forWorker) {
        s.prepend(workerPrelude(options.workerStripPrefix ?? ""));
        this.info(
          `dynamic-base: worker prelude prepended to ${chunk.fileName}`,
        );
      }

      if (!s.hasChanged()) return null;
      return { code: s.toString(), map: s.generateMap({ hires: true }) };
    },
    generateBundle(_options, bundle) {
      // A residual token in JS (a literal the regex couldn't rewrite, e.g. a
      // template interpolating after the token) or CSS (url() must stay
      // stylesheet-relative; the placeholder would ship verbatim and 404)
      // would fail silently at runtime — fail the build instead. HTML keeps
      // the token by design: the proxy substitutes it at serve time.
      for (const file of Object.values(bundle)) {
        const content =
          file.type === "chunk"
            ? file.code
            : file.fileName.endsWith(".css") && typeof file.source === "string"
              ? file.source
              : undefined;
        if (content?.includes(DYNAMIC_BASE_PLACEHOLDER)) {
          this.error(
            `dynamic-base: unrewritten placeholder ${DYNAMIC_BASE_PLACEHOLDER} remains in ${file.fileName}`,
          );
        }
      }
    },
  };
}

function escapeForRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
