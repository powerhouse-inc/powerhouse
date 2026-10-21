import {
  HOST_STYLESHEET,
  projectStyle,
  STYLE_IMPORT_LINES,
  TAILWIND_IMPORT,
} from "@powerhousedao/shared/clis/package-style";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { styleTemplate } from "templates";

/** style.css with Connect's imports replaced by the template's, keeping the
 * project's own rules; the template when there's no style.css. */
export function migratedStyle(
  current: string | undefined,
  localPackages: readonly string[] = [],
): string {
  if (current === undefined) return styleTemplate;
  const { tailwind, rest } = projectStyle(current, localPackages);
  const imports = STYLE_IMPORT_LINES.map((line) =>
    TAILWIND_IMPORT.test(line) && tailwind ? tailwind : line,
  ).join("\n");
  return rest ? `${imports}\n\n${rest}\n` : `${imports}\n`;
}

const COMMENTS = /\/\*[\s\S]*?\*\//g;
const PAGE_THEME = [
  /^\s*--[\w-]+\s*:/m,
  /^\s*(:root|html|body|\.dark)\b[^{]*\{/m,
];

/** A warning when style.css sets custom properties or global rules: `ph build`
 * ships them to every Connect that loads the package. */
export function pageThemeWarning(current: string | undefined) {
  const rules = projectStyle(current ?? "").rest.replace(COMMENTS, "");
  if (!PAGE_THEME.some((pattern) => pattern.test(rules))) return undefined;
  return (
    "style.css sets tokens or global rules (:root, html, body, .dark). ph build ships them " +
    "in the package's stylesheet, to every Connect that loads the package. Move this " +
    `Connect's theme to ${HOST_STYLESHEET}, and keep only the package's own tokens.`
  );
}

export function readStyle(projectDir: string): string | undefined {
  const file = join(projectDir, "style.css");
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}
