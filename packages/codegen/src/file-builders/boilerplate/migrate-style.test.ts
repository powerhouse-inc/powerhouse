import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { styleTemplate } from "templates";
import { writeGeneratedProjectRootFiles } from "./generated-project-files.js";
import { migratedStyle } from "./migrate-style.js";

const CUSTOM = `@theme {
  --color-brand: #f60;
}

.brand {
  color: var(--color-brand);
}`;

// The boilerplate's style.css before Connect's Tailwind source was exported.
const OLD_TEMPLATE = `@import "@powerhousedao/design-system/theme.css";
@custom-variant dark (&:where(.dark, .dark *));
@import "tailwindcss";
@import "@powerhousedao/connect/style.css";

${CUSTOM}
`;

// What projects that put tailwindcss first have.
const OLD_PROJECT = `@import "tailwindcss";
@import "@powerhousedao/design-system/theme.css";
@import "@powerhousedao/connect/style.css";

${CUSTOM}
`;

const imports = (css: string) =>
  css.split("\n").filter((line) => line.startsWith("@import"));

describe("migratedStyle", () => {
  it.each([
    ["the old template", OLD_TEMPLATE],
    ["a tailwindcss-first project", OLD_PROJECT],
  ])("moves %s to Connect's Tailwind source, keeping its rules", (_, css) => {
    const migrated = migratedStyle(css);
    expect(migrated.startsWith("/* Package CSS")).toBe(true);
    expect(imports(migrated)).toEqual([
      `@import "tailwindcss";`,
      `@import "@powerhousedao/connect/tailwind.css";`,
    ]);
    expect(migrated).not.toContain("@custom-variant");
    expect(migrated).toContain(CUSTOM);
  });

  it("leaves a migrated file as it is", () => {
    const once = migratedStyle(OLD_TEMPLATE);
    expect(migratedStyle(once)).toBe(once);
    const fresh = migratedStyle(styleTemplate);
    expect(migratedStyle(fresh)).toBe(fresh);
    expect(imports(fresh)).toHaveLength(2);
  });

  it("keeps the project's tailwindcss options and its own imports", () => {
    const migrated = migratedStyle(
      `@import "tailwindcss" source("./src");\n@import "@powerhousedao/connect/style.css";\n@import "./fonts.css";\n`,
    );
    expect(imports(migrated)).toEqual([
      `@import "tailwindcss" source("./src");`,
      `@import "@powerhousedao/connect/tailwind.css";`,
      `@import "./fonts.css";`,
    ]);
  });

  it("writes the template without a style.css", () => {
    expect(migratedStyle(undefined)).toBe(styleTemplate);
  });
});

describe("a project's style.css on migrate", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
  });

  it("keeps its rules when the root files are rewritten", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-migrate-style-"));
    dirs.push(dir);
    writeFileSync(join(dir, "style.css"), OLD_PROJECT);
    await writeGeneratedProjectRootFiles(dir);
    const css = readFileSync(join(dir, "style.css"), "utf8");
    expect(css).toContain(`@import "@powerhousedao/connect/tailwind.css";`);
    expect(css).not.toContain("connect/style.css");
    expect(css).toContain("--color-brand: #f60;");
  });
});
