import type { Plugin } from "rolldown";

// When a CJS transitive dep does `require("react")` / `require("react-dom")`,
// rolldown's CJS wrapper resolves those to the package's node_modules entry
// and inlines the full CJS source with `__commonJSMin`. Depending on size, it
// may land as a SEPARATE chunk (e.g. `react-HASH.js`) OR be placed INLINE
// inside a larger chunk as `//#region node_modules/<pkg>/...` blocks. Either
// way, that's a second React-family instance at runtime — alongside Connect's
// import-map-provided esm.sh React — and any hook that touches dispatcher
// state (useSyncExternalStore, useContext, …) crashes (or hits version-mismatch
// checks like React error #527).
//
// `esmExternalRequirePlugin` (rolldown builtin) only rewrites top-level
// `require("react")` text in source modules. It does not touch the residual
// `require_react()` bindings rolldown emits from CJS-wrapped modules in the
// bundler output. This plugin does the output-stage cleanup:
//
//   1. Detect bundled React-family chunks (filename + content signature),
//      rewrite each consumer's import from them to an external ESM import,
//      delete the chunk from output.
//   2. Detect INLINE `//#region node_modules/<pkg>/<entry>` wrapper blocks
//      inside other chunks, remove the region, and inject a top-of-chunk
//      shim that points the corresponding `require_X()` call sites at the
//      external ESM namespace.

const CHUNK_RULES: Array<{ file: RegExp; spec: string; marker: RegExp }> = [
  {
    file: /(?:^|\/)react-[A-Za-z0-9_-]+\.js$/,
    spec: "react",
    marker: /#region\s+node_modules\/react\/(?:cjs\/react|index)/,
  },
  {
    file: /(?:^|\/)react-dom-[A-Za-z0-9_-]+\.js$/,
    spec: "react-dom",
    marker: /#region\s+node_modules\/react-dom\/(?:cjs\/react-dom|index)/,
  },
  {
    file: /(?:^|\/)jsx-runtime-[A-Za-z0-9_-]+\.js$/,
    spec: "react/jsx-runtime",
    marker: /#region\s+node_modules\/react\/cjs\/react-jsx-runtime/,
  },
  {
    file: /(?:^|\/)react-dom-client-[A-Za-z0-9_-]+\.js$/,
    spec: "react-dom/client",
    marker: /#region\s+node_modules\/react-dom\/(?:cjs\/react-dom-client|client)/,
  },
];

// Inline regions — both the top-level wrappers (`index.js` / `client.js`) and
// the underlying CJS bodies (`cjs/*.production.js` / `cjs/*.development.js`).
// Each defines a `var require_X = __commonJSMin(...)`. We detect which
// `require_X` name is declared inside the region, delete the region, and
// replace that name with a shim that returns the external ESM namespace.
// Consumers sometimes call the wrapper (`require_react_dom`) and sometimes
// bypass it and call the production helper directly (`require_react_dom_client_production`),
// so we handle both cases.
const INLINE_WRAPPER_RULES: Array<{ regex: RegExp; spec: string }> = [
  // Top-level wrappers
  {
    regex:
      /\/\/#region\s+node_modules\/react\/index\.js[^\n]*\n[\s\S]+?\n\/\/#endregion[^\n]*\n?/g,
    spec: "react",
  },
  {
    regex:
      /\/\/#region\s+node_modules\/react-dom\/index\.js[^\n]*\n[\s\S]+?\n\/\/#endregion[^\n]*\n?/g,
    spec: "react-dom",
  },
  {
    regex:
      /\/\/#region\s+node_modules\/react-dom\/client\.js[^\n]*\n[\s\S]+?\n\/\/#endregion[^\n]*\n?/g,
    spec: "react-dom/client",
  },
  // Underlying production/development bodies
  {
    regex:
      /\/\/#region\s+node_modules\/react\/cjs\/react\.(?:production|development)\.js[^\n]*\n[\s\S]+?\n\/\/#endregion[^\n]*\n?/g,
    spec: "react",
  },
  {
    regex:
      /\/\/#region\s+node_modules\/react-dom\/cjs\/react-dom\.(?:production|development)\.js[^\n]*\n[\s\S]+?\n\/\/#endregion[^\n]*\n?/g,
    spec: "react-dom",
  },
  {
    regex:
      /\/\/#region\s+node_modules\/react-dom\/cjs\/react-dom-client\.(?:production|development)\.js[^\n]*\n[\s\S]+?\n\/\/#endregion[^\n]*\n?/g,
    spec: "react-dom/client",
  },
  {
    regex:
      /\/\/#region\s+node_modules\/react\/cjs\/react-jsx-runtime\.(?:production|development)\.js[^\n]*\n[\s\S]+?\n\/\/#endregion[^\n]*\n?/g,
    spec: "react/jsx-runtime",
  },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rewriteBundledReactToExternalPlugin(): Plugin {
  return {
    name: "rewrite-bundled-react-to-external",
    generateBundle(_options, bundle) {
      const chunkToSpec = new Map<string, string>();
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== "chunk") continue;
        for (const rule of CHUNK_RULES) {
          if (rule.file.test(fileName) && rule.marker.test(chunk.code)) {
            chunkToSpec.set(fileName, rule.spec);
            break;
          }
        }
      }

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== "chunk") continue;
        if (chunkToSpec.has(fileName)) continue;

        let code = chunk.code;
        const prepend: string[] = [];
        let extIdx = 0;
        let changed = false;

        for (const [chunkName, spec] of chunkToSpec) {
          const baseName = chunkName.split("/").pop()!;
          const esc = escapeRegex(baseName);
          const rel = `(?:\\.{1,2}\\/)+`;

          const namedImport = new RegExp(
            `import\\s*\\{\\s*[\\w$]+\\s+as\\s+([\\w$]+)\\s*\\}\\s*from\\s*['"]${rel}${esc}['"];?`,
            "g",
          );
          code = code.replace(namedImport, (_m, local: string) => {
            changed = true;
            const ns = `__ext${extIdx++}`;
            prepend.push(`import * as ${ns} from ${JSON.stringify(spec)};`);
            prepend.push(`var ${local} = () => ${ns};`);
            return "";
          });

          const sideEffect = new RegExp(
            `import\\s*['"]${rel}${esc}['"];?`,
            "g",
          );
          code = code.replace(sideEffect, () => {
            changed = true;
            return "";
          });
        }

        for (const rule of INLINE_WRAPPER_RULES) {
          rule.regex.lastIndex = 0;
          code = code.replace(rule.regex, (match) => {
            const nameMatch = match.match(
              /var\s+(require_[\w$]+)\s*=\s*(?:\/\*\s*@__PURE__\s*\*\/\s*)?__commonJSMin/,
            );
            if (!nameMatch) return match;
            const local = nameMatch[1];
            changed = true;
            const ns = `__ext${extIdx++}`;
            prepend.push(`import * as ${ns} from ${JSON.stringify(rule.spec)};`);
            prepend.push(`var ${local} = () => ${ns};`);
            return "";
          });
        }

        if (changed) {
          chunk.code = prepend.join("\n") + "\n" + code;
        }
      }

      for (const fileName of chunkToSpec.keys()) {
        delete bundle[fileName];
        const mapName = `${fileName}.map`;
        if (bundle[mapName]) delete bundle[mapName];
      }
    },
  };
}
