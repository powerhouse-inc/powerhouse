import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { styleImportsTemplate, styleTemplate } from "templates";

const lines = (text: string) => text.split("\n").map((line) => line.trim());

// Connect's stylesheet imports, current and past; the template's own lines too.
const MANAGED_LINES = [
  /^@layer theme, base, components\b.*;$/,
  /^@import ["']@powerhousedao\/design-system\/(theme|style)\.css["'];$/,
  /^@import ["']@powerhousedao\/connect\/(style|tailwind)\.css["'];$/,
  /^@custom-variant dark \(&:where\(\.dark, \.dark \*\)\);$/,
];
const TAILWIND_IMPORT = /^@import ["']tailwindcss["'].*;$/;
const IMPORTS = lines(styleImportsTemplate).filter(Boolean);
const TEMPLATE_LINES = new Set(IMPORTS);

/** style.css with Connect's imports replaced by the template's, keeping the
 * project's own rules; the template when there's no style.css. */
export function migratedStyle(current: string | undefined): string {
  if (current === undefined) return styleTemplate;
  let tailwind: string | undefined;
  const kept = current.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (TAILWIND_IMPORT.test(trimmed)) {
      // A project's `source(...)` or `prefix(...)` options stay.
      tailwind ??= trimmed;
      return false;
    }
    return (
      !TEMPLATE_LINES.has(trimmed) &&
      !MANAGED_LINES.some((pattern) => pattern.test(trimmed))
    );
  });
  const imports = IMPORTS.map((line) =>
    TAILWIND_IMPORT.test(line) && tailwind ? tailwind : line,
  ).join("\n");
  const rest = kept.join("\n").trim();
  return rest ? `${imports}\n\n${rest}\n` : `${imports}\n`;
}

export function readStyle(projectDir: string): string | undefined {
  const file = join(projectDir, "style.css");
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}
