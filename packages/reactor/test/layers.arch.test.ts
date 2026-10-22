import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function importsOf(path: string): string[] {
  const source = readFileSync(path, "utf8");
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
}

function sourcesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourcesIn(join(dir, entry.name))
      : entry.name.endsWith(".ts")
        ? [join(dir, entry.name)]
        : [],
  );
}

describe("reactor layers", () => {
  it("keeps the core facade off the client layer that wraps it", () => {
    const fromClient = importsOf(join(SRC, "core/reactor.ts")).filter((path) =>
      path.startsWith("../client/"),
    );
    expect(fromClient).toEqual([]);
  });

  it("keeps derivation off the executor", () => {
    const offenders = sourcesIn(join(SRC, "derivation")).flatMap((file) =>
      importsOf(file)
        .filter((path) => path.startsWith("../executor/"))
        .map((path) => `${file}: ${path}`),
    );
    expect(offenders).toEqual([]);
  });
});
