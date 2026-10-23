import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/**
 * Every import edge between top-level src directories today. A new edge fails
 * the ratchet; an edge that goes away must leave the list. The review named
 * cache -> executor and decision -> executor as inversions to remove.
 */
const PINNED_EDGES = new Set([
  "admin -> cache",
  "admin -> catch-up",
  "admin -> core",
  "admin -> decision",
  "admin -> events",
  "admin -> executor",
  "admin -> job-tracker",
  "admin -> protocol",
  "admin -> queue",
  "admin -> read-models",
  "admin -> registry",
  "admin -> shared",
  "admin -> storage",
  "cache -> catch-up",
  "cache -> derivation",
  "cache -> executor",
  "cache -> protocol",
  "cache -> registry",
  "cache -> shared",
  "cache -> storage",
  "catch-up -> cache",
  "catch-up -> events",
  "catch-up -> storage",
  "client -> actions",
  "client -> cache",
  "client -> core",
  "client -> decision",
  "client -> executor",
  "client -> shared",
  "client -> storage",
  "client -> subs",
  "client -> sync",
  "core -> actions",
  "core -> admin",
  "core -> cache",
  "core -> catch-up",
  "core -> client",
  "core -> decision",
  "core -> derivation",
  "core -> events",
  "core -> executor",
  "core -> inspector",
  "core -> job-tracker",
  "core -> processors",
  "core -> projection",
  "core -> protocol",
  "core -> queue",
  "core -> read-models",
  "core -> registry",
  "core -> shared",
  "core -> signer",
  "core -> storage",
  "core -> subs",
  "core -> sync",
  "decision -> cache",
  "decision -> executor",
  "decision -> protocol",
  "decision -> registry",
  "decision -> shared",
  "decision -> storage",
  "derivation -> protocol",
  "derivation -> registry",
  "derivation -> shared",
  "derivation -> storage",
  "events -> catch-up",
  "events -> queue",
  "events -> shared",
  "events -> signer",
  "executor -> cache",
  "executor -> core",
  "executor -> decision",
  "executor -> derivation",
  "executor -> events",
  "executor -> job-tracker",
  "executor -> protocol",
  "executor -> queue",
  "executor -> registry",
  "executor -> shared",
  "executor -> signer",
  "executor -> storage",
  "executor -> utils",
  "inspector -> admin",
  "inspector -> cache",
  "inspector -> catch-up",
  "inspector -> core",
  "inspector -> queue",
  "inspector -> registry",
  "inspector -> shared",
  "inspector -> storage",
  "inspector -> sync",
  "job-tracker -> events",
  "job-tracker -> executor",
  "job-tracker -> queue",
  "job-tracker -> shared",
  "processors -> cache",
  "processors -> client",
  "processors -> read-models",
  "processors -> shared",
  "processors -> storage",
  "projection -> cache",
  "projection -> catch-up",
  "projection -> core",
  "projection -> events",
  "projection -> executor",
  "projection -> protocol",
  "projection -> read-models",
  "projection -> registry",
  "projection -> shared",
  "projection -> storage",
  "protocol -> registry",
  "protocol -> shared",
  "queue -> events",
  "queue -> protocol",
  "queue -> registry",
  "queue -> shared",
  "read-models -> cache",
  "read-models -> catch-up",
  "read-models -> events",
  "read-models -> shared",
  "read-models -> storage",
  "registry -> core",
  "registry -> executor",
  "rpc -> client",
  "rpc -> executor",
  "rpc -> registry",
  "rpc -> shared",
  "rpc -> sync",
  "shared -> events",
  "shared -> queue",
  "shared -> signer",
  "signer -> executor",
  "storage -> cache",
  "storage -> read-models",
  "storage -> shared",
  "storage -> sync",
  "subs -> events",
  "subs -> read-models",
  "subs -> shared",
  "subs -> storage",
  "sync -> cache",
  "sync -> catch-up",
  "sync -> core",
  "sync -> events",
  "sync -> queue",
  "sync -> shared",
  "sync -> storage",
]);

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

/** `from -> to` for each relative import that crosses a top-level src directory. */
function directoryEdges(): Set<string> {
  const top = (path: string) => {
    const parts = relative(SRC, path).split(sep);
    return parts.length > 1 ? parts[0] : ".";
  };
  const edges = new Set<string>();
  for (const file of sourcesIn(SRC)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g,
    )) {
      const target = resolve(dirname(file), match[1]);
      if (!target.startsWith(SRC)) continue;
      const [from, to] = [top(file), top(target)];
      if (from !== to) edges.add(`${from} -> ${to}`);
    }
  }
  return edges;
}

describe("reactor layers", () => {
  const edges = directoryEdges();

  it("adds no import edge between src directories", () => {
    expect([...edges].filter((edge) => !PINNED_EDGES.has(edge))).toEqual([]);
  });

  it("drops a pinned edge once it is gone", () => {
    expect([...PINNED_EDGES].filter((edge) => !edges.has(edge))).toEqual([]);
  });

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
