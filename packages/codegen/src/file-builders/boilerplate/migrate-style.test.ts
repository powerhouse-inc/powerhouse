import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LEGACY_THEME_LINES } from "@powerhousedao/shared/clis/package-style";
import { styleTemplate } from "templates";

const legacyThemeTemplate = `${LEGACY_THEME_LINES.join("\n")}\n`;
import { writeGeneratedProjectRootFiles } from "./generated-project-files.js";
import { migratedStyle, pageThemeWarning } from "./migrate-style.js";

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

  it("drops the old template's empty @theme block", () => {
    const migrated = migratedStyle(
      `${styleTemplate}\n${legacyThemeTemplate}\n.brand { color: red; }\n`,
    );
    expect(migrated).not.toContain("@theme");
    expect(migrated).toContain(".brand { color: red; }");
  });

  it("drops the full builds ph install --local used to import, not other CSS", () => {
    const vendor = `@import './node_modules/react-day-picker/dist/style.css';`;
    const migrated = migratedStyle(
      `${styleTemplate}@import './node_modules/@acme/pkg/dist/style.css';\n${vendor}\n`,
      ["@acme/pkg"],
    );
    expect(migrated).not.toContain("@acme/pkg");
    expect(migrated).toContain(vendor);
  });

  it("adds the properties layer to an old project's layer order", () => {
    const old = `@layer theme, base, components, external-packages, utilities;\n@import "tailwindcss";\n`;
    expect(migratedStyle(old).split("\n")).toContain(
      "@layer properties, theme, base, components, external-packages, utilities;",
    );
  });
});

describe("pageThemeWarning", () => {
  it("warns when style.css sets tokens or global rules", () => {
    expect(pageThemeWarning(OLD_TEMPLATE)).toContain("hosts/connect/style.css");
    expect(
      pageThemeWarning(`${styleTemplate}\n:root.dark { color: red; }\n`),
    ).toBeDefined();
  });

  it("stays quiet for the template and the package's own rules", () => {
    expect(pageThemeWarning(styleTemplate)).toBeUndefined();
    expect(
      pageThemeWarning(`${styleTemplate}${legacyThemeTemplate}`),
    ).toBeUndefined();
    expect(
      pageThemeWarning(`${styleTemplate}\n.brand { color: red; }\n`),
    ).toBeUndefined();
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

  it("seeds the host's stylesheet, and keeps one that exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-migrate-style-"));
    dirs.push(dir);
    await writeGeneratedProjectRootFiles(dir);
    const host = join(dir, "hosts/connect/style.css");
    expect(readFileSync(host, "utf8")).toContain("@theme");
    writeFileSync(host, ":root { --x: 1; }\n");
    await writeGeneratedProjectRootFiles(dir);
    expect(readFileSync(host, "utf8")).toBe(":root { --x: 1; }\n");
  });
});
