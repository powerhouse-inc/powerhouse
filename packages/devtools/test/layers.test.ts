import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "../src");

/** The folders of `src` each folder may import from, besides itself. A file
 * at the top of `src` puts the layers together and is under no rule. */
const MAY_IMPORT: Record<string, readonly string[]> = {
  lib: [],
  ui: ["lib"],
  shell: ["lib", "ui"],
  build: ["lib", "ui", "shell"],
  overview: ["lib", "ui", "shell", "build"],
  // The page's entry modules and the server know nothing of the panels.
  client: [],
  connect: ["server"],
  server: [],
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const layerOf = (file: string) => relative(SRC, file).split(/[\\/]/)[0];

describe("the layers of DevTools", () => {
  it("import only the layers below them", () => {
    const crossings: string[] = [];
    for (const file of sources(SRC)) {
      const from = layerOf(file);
      if (!(from in MAY_IMPORT)) continue;
      const allowed = MAY_IMPORT[from];
      const text = readFileSync(file, "utf8");
      for (const [, specifier] of text.matchAll(
        /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g,
      )) {
        const target = resolve(dirname(file), specifier);
        const to = layerOf(target);
        if (to !== from && to in MAY_IMPORT && !allowed.includes(to)) {
          crossings.push(`${relative(SRC, file)} -> ${specifier}`);
        }
      }
    }
    expect(crossings).toEqual([]);
  });
});
