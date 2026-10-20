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
  ["a project's", join(root, "../../test/versioned-documents/style.css")],
])("%s stylesheet", (_name, entry) => {
  it("is one Tailwind build", async () => {
    const css = await build(entry, ["px-3", "pl-7"]);
    expect(count(css, "tailwindcss v")).toBe(1);
    expect(count(css, ".px-3 {")).toBe(1);
    expect(css.indexOf(".pl-7 {")).toBeGreaterThan(css.indexOf(".px-3 {"));
  });
});
