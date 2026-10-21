import { packageStyleEntry } from "@powerhousedao/shared/clis/package-style";
import { compile } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function build(entry: string, candidates: string[]) {
  const compiler = await compile(readFileSync(entry, "utf8"), {
    base: dirname(entry),
    from: entry,
    onDependency: () => {},
  });
  return compiler.build(candidates);
}

const count = (css: string, text: string) => css.split(text).length - 1;

// A second build re-emits utilities in source order, so `px-3` would override an earlier `pl-7`.
describe.each([
  ["Connect's", join(root, "style.css")],
  ["a project's", join(root, "test/fixtures/project/style.css")],
])("%s stylesheet", (_name, entry) => {
  it("is one Tailwind build", async () => {
    const css = await build(entry, ["px-3", "pl-7"]);
    expect(count(css, "tailwindcss v")).toBe(1);
    expect(count(css, ".px-3 {")).toBe(1);
    expect(css.indexOf(".pl-7 {")).toBeGreaterThan(css.indexOf(".px-3 {"));
  });
});

describe("a package's stylesheet against Connect's theme", () => {
  // Compiled from the project fixture's folder, which resolves Connect's theme.
  const from = join(root, "test/fixtures/project/package.css");
  const compiler = (projectCss?: string) =>
    compile(packageStyleEntry(projectCss, { browserDir: "./dist/browser" }), {
      base: dirname(from),
      from,
      onDependency: () => {},
    });

  it("scans the package's browser build, none of Connect's sources", async () => {
    const { sources } = await compiler();
    expect(sources).toEqual([
      expect.objectContaining({ pattern: "./dist/browser", negated: false }),
      expect.objectContaining({
        pattern: "./dist/browser/**/*.map",
        negated: true,
      }),
    ]);
  });

  it("has the package's classes, with Connect's tokens but not its reset", async () => {
    const css = (await compiler()).build([
      "bg-gray-200",
      "bg-core-bg",
      "dark:p-2",
      "scrollbar-thin",
    ]);
    expect(css).toContain("var(--color-gray-200, hsl(0 0% 94%))");
    expect(css).toContain("var(--ph-core-bg)");
    expect(css).toContain(".dark\\:p-2");
    expect(css).toContain(".scrollbar-thin");
    expect(css).not.toContain("box-sizing");
    expect(css).not.toContain("--color-gray-200:");
  });

  it("keeps the project's prefix and important options", async () => {
    const projectCss = `@import "tailwindcss" source("./src") prefix(tw) important;\n@import "@powerhousedao/connect/tailwind.css";\n`;
    const css = (await compiler(projectCss)).build([
      "tw:flex",
      "tw:bg-background",
    ]);
    expect(css).toContain(".tw\\:flex {\n  display: flex !important;");
    expect(css).toContain("background-color: var(--background) !important;");
  });
});
