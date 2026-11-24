import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ID = "virtual:ph-devtools-css";
const RESOLVED = `\0${ID}`;

/** Where `pnpm build:css` writes the stylesheet `standalone.css` builds. */
export const COMPILED_CSS = join(import.meta.dirname, ".cache/standalone.css");

const PROPERTY_RULE = /@property\s+(--[\w-]+)\s*\{([^}]*)\}/g;

/**
 * The stylesheet for a shadow root. `@property` rules register from a
 * document's own stylesheets only, so in a shadow root the properties that
 * Tailwind's utilities build on have no initial value. This sets each one's
 * initial value on every element instead, in Tailwind's lowest layer, as its
 * own fallback for a browser without `@property` does. Nothing is registered
 * on the page, whose own `--tw-*` properties keep their meaning.
 *
 * @param {string} css
 */
export function withPropertyDefaults(css) {
  const defaults = [...css.matchAll(PROPERTY_RULE)].flatMap(
    ([, name, body]) => {
      const initial = /initial-value\s*:\s*([^;]+)/.exec(body);
      return initial ? [`${name}:${initial[1].trim()}`] : [];
    },
  );
  if (defaults.length === 0) return css;
  // Named first, so it stays below every other layer.
  return `@layer properties;${css}\n@layer properties{*,:before,:after,::backdrop{${defaults.join(";")}}}`;
}

/**
 * Serves the compiled stylesheet as the text module `mountDevtools` imports.
 * A missing file is an error unless `optional`, which the tests use: they
 * render no styles.
 *
 * @param {{ optional?: boolean }} [options]
 */
export function cssText(options = {}) {
  const read = () => {
    if (existsSync(COMPILED_CSS)) return readFileSync(COMPILED_CSS, "utf8");
    if (options.optional) return "";
    throw new Error(`${COMPILED_CSS} is missing: run \`pnpm build:css\`.`);
  };
  return {
    name: "ph-devtools-css-text",
    /** @param {string} id */
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    /** @param {string} id */
    load: (id) =>
      id === RESOLVED
        ? `export default ${JSON.stringify(withPropertyDefaults(read()))};`
        : undefined,
  };
}
