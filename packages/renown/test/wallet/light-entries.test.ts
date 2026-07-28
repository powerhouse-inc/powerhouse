import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The point of the adapter split: importing `@renown/sdk/wallet/<id>` must not
// require the adapter's wallet library, only make it a build-time dependency.
const WALLET_PEERS = [
  "@privy-io/react-auth",
  "@rainbow-me/rainbowkit",
  "@tanstack/react-query",
  "wagmi",
];

const ADAPTERS = ["rainbow", "privy", "mock"] as const;
const PACKAGE_ROOT = resolve(import.meta.dirname, "../..");

// Static import/export specifiers, including `import type`. Type-only imports
// count: they would drag the peer into a consumer's typecheck via the .d.ts.
const STATIC_SPECIFIER =
  /(?:^|\n)\s*(?:import|export)\s(?:[\s\S]*?\sfrom\s)?["']([^"']+)["']/g;

function staticSpecifiers(source: string): string[] {
  return Array.from(source.matchAll(STATIC_SPECIFIER), (m) => m[1]);
}

function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = join(dirname(fromFile), specifier);
  const candidates = base.endsWith(".js")
    ? [base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx"), base]
    : [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

// Every module reachable from `entry` through static relative imports.
function staticClosure(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    const specifiers = staticSpecifiers(readFileSync(file, "utf8"));
    seen.set(file, specifiers);
    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) continue;
      const next = resolveRelative(file, specifier);
      if (next) queue.push(next);
    }
  }
  return seen;
}

function offendingImports(closure: Map<string, string[]>): string[] {
  const offenders: string[] = [];
  for (const [file, specifiers] of closure) {
    for (const specifier of specifiers) {
      const peer = WALLET_PEERS.find(
        (name) => specifier === name || specifier.startsWith(`${name}/`),
      );
      if (peer) {
        offenders.push(
          `${file.slice(PACKAGE_ROOT.length + 1)} -> ${specifier}`,
        );
      }
    }
  }
  return offenders;
}

describe.each(ADAPTERS)("wallet/%s light entry", (adapter) => {
  it("reaches no wallet library through static imports", () => {
    const entry = join(PACKAGE_ROOT, "src/wallet", adapter, "index.ts");
    expect(offendingImports(staticClosure(entry))).toEqual([]);
  });

  it("loads its factory through a dynamic import", () => {
    const entry = join(PACKAGE_ROOT, "src/wallet", adapter, "index.ts");
    expect(readFileSync(entry, "utf8")).toContain('import("./factory.js")');
  });
});

describe("wallet core", () => {
  it("names no adapter", () => {
    const closure = staticClosure(join(PACKAGE_ROOT, "src/wallet/index.ts"));
    const files = Array.from(closure.keys()).map((file) =>
      file.slice(PACKAGE_ROOT.length + 1),
    );
    expect(
      files.filter((file) => /\/(rainbow|privy|mock)\//.test(file)),
    ).toEqual([]);
    for (const [, specifiers] of closure) {
      expect(specifiers.filter((s) => /(rainbow|privy|mock)/.test(s))).toEqual(
        [],
      );
    }
  });
});

// Guards the built output too: catches a broken tsdown entry list, where the
// factory would get inlined into the light entry instead of split out.
describe("built output", () => {
  const dist = join(PACKAGE_ROOT, "dist/wallet");
  const built = existsSync(dist);

  it.runIf(built).each(ADAPTERS)(
    "dist/wallet/%s emits a separate factory chunk",
    (adapter) => {
      expect(existsSync(join(dist, adapter, "factory.js"))).toBe(true);
      const entry = readFileSync(join(dist, adapter, "index.js"), "utf8");
      expect(entry).toContain('import("./factory.js")');
      expect(
        offendingImports(
          new Map([[join(dist, adapter, "index.js"), staticSpecifiers(entry)]]),
        ),
      ).toEqual([]);
    },
  );
});
