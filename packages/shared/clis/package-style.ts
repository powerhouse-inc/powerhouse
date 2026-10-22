// style.css's managed lines, and the package stylesheet `ph build` compiles from
// it. Kept light: ph build imports this, and ph migrate (codegen) shares it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONNECT_LAYER_ORDER } from "../connect/layers.js";

/** The imports at the top of a project's style.css, which `ph migrate` keeps current. */
export const STYLE_IMPORT_LINES = [
  "/* Package CSS goes in external-packages, between Connect's components and utilities. */",
  CONNECT_LAYER_ORDER,
  '@import "tailwindcss";',
  "/* Connect's tokens, rules and classes, generated in this one build. */",
  '@import "@powerhousedao/connect/tailwind.css";',
];

/** The empty @theme block the style.css template used to end with. */
export const LEGACY_THEME_LINES = [
  "@theme {",
  "/* You can customize the theme by overriding the theme variables here */",
  "/* See https://tailwindcss.com/docs/theme#using-a-custom-theme for details */",
  "/* If you would prefer to use plain css, add your styles below this @theme tag as you normally would */",
  "/* A sensible CSS reset is applied by default. If you would prefer to use a different reset or none at all, uncomment the following line */",
  "/* --*: initial; */",
  "}",
];

/** The default host's stylesheet, beside hosts/connect/routes. */
export const HOST_STYLESHEET = "hosts/connect/style.css";

// Connect's stylesheet imports, current and past; the template's own lines too.
const MANAGED_LINES = [
  /^@layer (properties, )?theme, base, components\b.*;$/,
  /^@import ["']@powerhousedao\/design-system\/(theme|style)\.css["'];$/,
  /^@import ["']@powerhousedao\/connect\/(style|tailwind)\.css["'];$/,
  /^@custom-variant dark \(&:where\(\.dark, \.dark \*\)\);$/,
];
// A package's full build, which `ph install --local` used to add.
const PACKAGE_BUILD_IMPORT =
  /^@import ["']\.\/node_modules\/(.+)\/dist\/style\.css["'];$/;
export const TAILWIND_IMPORT = /^@import ["']tailwindcss["'].*;$/;
const TEMPLATE_LINES = new Set(STYLE_IMPORT_LINES);

// `kept` without the old template's empty @theme block, matched line by line.
function withoutLegacyTheme(kept: string[]) {
  const filled = kept.flatMap((line, i) => (line.trim() ? [i] : []));
  for (
    let start = 0;
    start + LEGACY_THEME_LINES.length <= filled.length;
    start++
  ) {
    const block = filled.slice(start, start + LEGACY_THEME_LINES.length);
    if (block.every((i, n) => kept[i].trim() === LEGACY_THEME_LINES[n])) {
      return [...kept.slice(0, block[0]), ...kept.slice(block.at(-1)! + 1)];
    }
  }
  return kept;
}

// The project's own lines, and its tailwindcss import if it has one. Imports of
// its local packages' builds go; other node_modules CSS stays.
export function projectStyle(
  current: string,
  localPackages: readonly string[] = [],
) {
  let tailwind: string | undefined;
  const kept = current.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (TAILWIND_IMPORT.test(trimmed)) {
      // A project's `source(...)` or `prefix(...)` options stay.
      tailwind ??= trimmed;
      return false;
    }
    const packageBuild = PACKAGE_BUILD_IMPORT.exec(trimmed)?.[1];
    return (
      !TEMPLATE_LINES.has(trimmed) &&
      !MANAGED_LINES.some((pattern) => pattern.test(trimmed)) &&
      !(packageBuild && localPackages.includes(packageBuild))
    );
  });
  return { tailwind, rest: withoutLegacyTheme(kept).join("\n").trim() };
}

// Options of the project's `@import "tailwindcss"` that the package build keeps:
// not source(), which it replaces, nor theme(), which clashes with theme(reference).
function tailwindOptions(tailwind: string | undefined) {
  if (!tailwind) return "";
  const options = tailwind
    .replace(/^@import ["']tailwindcss["']/, "")
    .replace(/;$/, "")
    .replace(/\b(source|theme)\([^)]*\)/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return options ? ` ${options}` : "";
}

export type PackageStyleOptions = {
  /** The package's browser build, relative to the project. */
  browserDir: string;
  /** The project's local packages, whose old style.css imports are dropped. */
  localPackages?: readonly string[];
  /** The theme the classes build against, by reference: Connect's by default. */
  references?: readonly string[];
};

/** What `ph build` compiles to a package's stylesheet: the classes in the
 * package's browser build, and the project's own tokens and rules, with
 * Tailwind's and Connect's theme by reference, so not emitted. */
export function packageStyleEntry(
  current: string | undefined,
  {
    browserDir,
    localPackages,
    references = ["@powerhousedao/connect/theme.css"],
  }: PackageStyleOptions,
): string {
  const { tailwind, rest } = projectStyle(current ?? "", localPackages);
  const options = tailwindOptions(tailwind);
  return `${[
    `@import "tailwindcss/theme.css" theme(reference)${options};`,
    ...references.map((file) => `@reference ${JSON.stringify(file)};`),
    `@import "tailwindcss/utilities.css" source(none)${options};`,
    `@source ${JSON.stringify(browserDir)};`,
    // Source maps carry the sources the bundle left out.
    `@source not ${JSON.stringify(`${browserDir}/**/*.map`)};`,
    rest,
  ].join("\n")}\n`;
}

const BANNER = /^\/\*! tailwindcss v[^*]*\*\/\s*/;

/** The compiled entry in the external-packages layer, between Connect's
 * components and utilities, whichever of Connect's stylesheets loads first. */
export function packageStylesheet(compiled: string): string {
  const css = compiled.replace(BANNER, "").trim();
  return `${CONNECT_LAYER_ORDER}\n@layer external-packages{${css}}\n`;
}

/** The project's `provider: "local"` packages, from powerhouse.config.json. */
export function localPackageNames(projectDir: string): string[] {
  const file = join(projectDir, "powerhouse.config.json");
  if (!existsSync(file)) return [];
  try {
    const config = JSON.parse(readFileSync(file, "utf8")) as {
      packages?: { packageName?: unknown; provider?: unknown }[];
    };
    return (config.packages ?? []).flatMap((p) =>
      p.provider === "local" && typeof p.packageName === "string"
        ? [p.packageName]
        : [],
    );
  } catch {
    return [];
  }
}
