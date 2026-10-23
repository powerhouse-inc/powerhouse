import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import postcss from "postcss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGACY_THEME_LINES } from "@powerhousedao/shared/clis/package-style";
import { hostStyleTemplate, styleTemplate } from "templates";
import { formatSafe } from "utils";

const legacyThemeTemplate = `${LEGACY_THEME_LINES.join("\n")}\n`;
import {
  writeAllGeneratedProjectFiles,
  writeGeneratedProjectRootFiles,
} from "./generated-project-files.js";
import { CONNECT_THEME_TOKENS, migratedStyle } from "./migrate-style.js";

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

describe("CONNECT_THEME_TOKENS", () => {
  it("lists the tokens the design system and core set on :root and .dark", () => {
    const tokens = new Set<string>();
    for (const file of [
      "../../../../design-system/theme.css",
      "../../../../connect-core/theme.css",
    ]) {
      const css = readFileSync(new URL(file, import.meta.url), "utf8");
      postcss.parse(css).walkRules(/^(:root|\.dark|:root\.dark)$/, (rule) => {
        rule.walkDecls((decl) => void tokens.add(decl.prop));
      });
    }
    expect([...CONNECT_THEME_TOKENS].sort()).toEqual([...tokens].sort());
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

// A project that themed Connect in its package's style.css, as UMH did.
const THEMED = `@import "tailwindcss";
@import "@powerhousedao/connect/style.css";

@theme {
  --color-umh: #0036ff;
}

/* UMH blue for primary buttons and focus rings. */
:root {
  --primary: var(--color-umh);
  --ring: var(--color-umh);
}

:root.dark {
  --primary: #7a93ff;
  --umh-graphite: #e6e9ef;
}

:root {
  --umh-andon-green: #1f9d55;
}

.umh-page {
  color: var(--umh-graphite);
}
`;

describe("Connect's theme in style.css on migrate", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
  });

  async function migrateProject(files: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), "ph-migrate-theme-"));
    dirs.push(dir);
    for (const [file, css] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), css);
    }
    const log = vi.spyOn(console, "log");
    const warn = vi.spyOn(console, "warn");
    await writeAllGeneratedProjectFiles(dir);
    const read = (file: string) => readFileSync(join(dir, file), "utf8");
    const messages = (spy: typeof log) => {
      const text = spy.mock.calls.map((args) => String(args[0])).join("\n");
      spy.mockRestore();
      return text;
    };
    return {
      style: read("style.css"),
      host: read("hosts/connect/style.css"),
      info: messages(log),
      warnings: messages(warn),
    };
  }

  const declsOf = (css: string, selector: string) => {
    const decls: string[] = [];
    postcss.parse(css).walkRules(selector, (rule) => {
      rule.walkDecls((decl) => void decls.push(`${decl.prop}: ${decl.value}`));
    });
    return decls;
  };

  it("moves the token overrides to a new host stylesheet", async () => {
    const { style, host, info, warnings } = await migrateProject({
      "style.css": THEMED,
    });
    expect(declsOf(host, ":root")).toEqual([
      "--primary: var(--color-umh)",
      "--ring: var(--color-umh)",
    ]);
    expect(declsOf(host, ":root.dark")).toEqual(["--primary: #7a93ff"]);
    expect(host).toContain("UMH blue for primary buttons");
    expect(host).toContain("@theme static");
    // The package's own tokens and rules stay.
    expect(style).not.toMatch(/--primary|--ring|UMH blue/);
    expect(declsOf(style, ":root")).toEqual(["--umh-andon-green: #1f9d55"]);
    expect(declsOf(style, ":root.dark")).toEqual(["--umh-graphite: #e6e9ef"]);
    expect(style).toContain("--color-umh: #0036ff;");
    expect(style).toContain(".umh-page");
    expect(info).toContain(
      "Moved Connect's theme from style.css to hosts/connect/style.css",
    );
    expect(info).toContain(":root (--primary, --ring)");
    expect(warnings).not.toContain("theme tokens");

    // A second run finds nothing to move and leaves the host's file alone.
    const again = await migrateProject({
      "style.css": style,
      "hosts/connect/style.css": host,
    });
    expect(again.style).toBe(style);
    expect(again.host).toBe(host);
    expect(again.info).not.toContain("Moved Connect's theme");
    expect(again.warnings).not.toContain("theme tokens");
  });

  it("fills the template's host stylesheet that migrate seeded earlier", async () => {
    const seeded = await migrateProject({ "style.css": styleTemplate });
    const { host } = await migrateProject({
      "style.css": THEMED,
      "hosts/connect/style.css": seeded.host,
    });
    expect(declsOf(host, ":root")).toHaveLength(2);
    expect(host.match(/^:root \{/gm)).toHaveLength(1);
  });

  it("warns, naming the file, rules and tokens, when the host has rules of its own", async () => {
    const own = `:root {\n  --background: #fff;\n}\n`;
    const { style, host, warnings } = await migrateProject({
      "style.css": THEMED,
      "hosts/connect/style.css": own,
    });
    expect(host).toBe(own);
    expect(declsOf(style, ":root")).toContain("--primary: var(--color-umh)");
    expect(warnings).toContain("Move them to hosts/connect/style.css");
    expect(warnings).toContain(
      ":root (--primary, --ring): hosts/connect/style.css has rules of its own",
    );
    expect(warnings).toContain(":root.dark (--primary)");
  });

  it("warns about overrides it can't move on its own", async () => {
    const { style, host, info, warnings } = await migrateProject({
      "style.css": `${styleTemplate}
@layer base {
  :root {
    --primary: #0a5bc4;
  }
}
:root,
.umh-page {
  --ring: red;
}
body {
  font-size: 14px;
}
`,
    });
    expect(style).toContain("--primary: #0a5bc4;");
    expect(style).toContain("--ring: red;");
    expect(declsOf(host, ":root")).toEqual([]);
    expect(info).not.toContain("Moved Connect's theme");
    expect(warnings).toContain(":root (--primary): inside @layer base");
    expect(warnings).toContain(
      ":root, .umh-page (--ring): its selector targets other elements too",
    );
    expect(warnings).toContain("style.css has global rules (body)");
  });

  it("warns and keeps style.css when it isn't valid CSS", async () => {
    const css = `${styleTemplate}\n:root {\n  --primary: red;\n`;
    const { style, warnings } = await migrateProject({ "style.css": css });
    expect(style).toContain("--primary: red;");
    expect(warnings).toContain("Couldn't check style.css for Connect's theme");
  });

  it("does nothing for a project without overrides", async () => {
    const css = `${styleTemplate}\n:root {\n  --umh-andon-green: #1f9d55;\n}\n`;
    const { style, host, info, warnings } = await migrateProject({
      "style.css": css,
    });
    expect(style).toBe(await formatSafe(css, "css"));
    expect(host).toBe(await formatSafe(hostStyleTemplate, "css"));
    expect(info).not.toContain("Connect's theme");
    expect(warnings).not.toContain("style.css");
  });
});
