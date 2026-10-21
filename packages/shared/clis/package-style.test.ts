import { describe, expect, it } from "vitest";
import {
  localPackageNames,
  packageStyleEntry,
  packageStylesheet,
} from "./package-style.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CUSTOM = `@theme {
  --color-brand: #f60;
}

.brand {
  color: var(--color-brand);
}`;

const PROJECT = `@layer properties, theme, base, components, external-packages, utilities;
@import "tailwindcss";
@import "@powerhousedao/connect/tailwind.css";

${CUSTOM}
`;

const imports = (css: string) =>
  css.split("\n").filter((line) => line.startsWith("@import"));

describe("packageStyleEntry", () => {
  it("references Tailwind's and Connect's theme and keeps the project's rules", () => {
    const entry = packageStyleEntry(PROJECT, { browserDir: "./dist/browser" });
    expect(imports(entry)).toEqual([
      `@import "tailwindcss/theme.css" theme(reference);`,
      `@import "tailwindcss/utilities.css" source(none);`,
    ]);
    expect(entry).toContain(`@reference "@powerhousedao/connect/theme.css";`);
    expect(entry).not.toContain("@layer");
    expect(entry).toContain(CUSTOM);
  });

  it("scans only the package's browser build, keeping the project's other options", () => {
    const entry = packageStyleEntry(
      `@import "tailwindcss" source("./src") theme(static) prefix(tw) important;\n@import "@powerhousedao/connect/tailwind.css";\n`,
      { browserDir: "./out/browser" },
    );
    expect(imports(entry)).toEqual([
      `@import "tailwindcss/theme.css" theme(reference) prefix(tw) important;`,
      `@import "tailwindcss/utilities.css" source(none) prefix(tw) important;`,
    ]);
    expect(entry).toContain(`@source "./out/browser";`);
  });

  it("drops only the local packages' old imports", () => {
    const vendor = `@import './node_modules/react-day-picker/dist/style.css';`;
    const entry = packageStyleEntry(
      `@import './node_modules/@acme/pkg/dist/style.css';\n${vendor}\n`,
      { browserDir: "./dist/browser", localPackages: ["@acme/pkg"] },
    );
    expect(entry).not.toContain("@acme/pkg");
    expect(entry).toContain(vendor);
  });

  it("builds the package's classes without a style.css", () => {
    expect(
      packageStyleEntry(undefined, { browserDir: "./dist/browser" }),
    ).toContain(`@source "./dist/browser";`);
  });
});

describe("packageStylesheet", () => {
  it("puts the build in external-packages, without Tailwind's banner", () => {
    const css = packageStylesheet(
      "/*! tailwindcss v4.2.2 | MIT License | https://tailwindcss.com */\n.flex{display:flex}\n",
    );
    expect(css).toBe(
      "@layer properties, theme, base, components, external-packages, utilities;\n" +
        "@layer external-packages{.flex{display:flex}}\n",
    );
  });
});

describe("localPackageNames", () => {
  it("lists the provider: local packages of powerhouse.config.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-package-style-"));
    try {
      expect(localPackageNames(dir)).toEqual([]);
      writeFileSync(
        join(dir, "powerhouse.config.json"),
        JSON.stringify({
          packages: [
            { packageName: "@acme/pkg", provider: "local" },
            { packageName: "@acme/other", provider: "registry" },
          ],
        }),
      );
      expect(localPackageNames(dir)).toEqual(["@acme/pkg"]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
