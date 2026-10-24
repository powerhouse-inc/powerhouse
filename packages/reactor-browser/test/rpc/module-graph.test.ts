import { describe, expect, it } from "vitest";
import {
  ModuleGraph,
  resolveSharedSpecifier,
} from "../../src/rpc/module-graph.js";

const CDN = "https://cdn.test/pkg/browser";

function moduleUrl(source: string): string {
  return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

const sharedDep = moduleUrl("export const marker = {};");
const sharedSub = moduleUrl("export const sub = {};");

/** A graph over in-memory sources, recording what it fetched and created. */
function graphOver(
  files: Record<string, string>,
  sharedImports: Record<string, string> = { dep: sharedDep },
) {
  const fetched: string[] = [];
  const created: string[] = [];
  const warnings: string[] = [];
  const graph = new ModuleGraph({
    sharedImports,
    fetchSource: (url) => {
      fetched.push(url);
      const file = url.slice(CDN.length + 1);
      return Object.hasOwn(files, file)
        ? Promise.resolve(files[file])
        : Promise.reject(new Error(`404 ${url}`));
    },
    createModuleUrl: (source) => {
      created.push(source);
      return moduleUrl(source);
    },
    warn: (message) => warnings.push(message),
  });
  return { graph, fetched, created, warnings };
}

async function load(graph: ModuleGraph, file: string) {
  const url = await graph.resolve(`${CDN}/${file}`);
  return (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
}

const { marker } = (await import(/* @vite-ignore */ sharedDep)) as {
  marker: object;
};

describe("resolveSharedSpecifier", () => {
  const imports = {
    "document-model": "https://v/dm.js",
    "document-model/core": "https://v/dm-core.js",
    "zod/": "https://v/zod/",
    "zod/v4/": "https://v/zod4/",
  };

  it("takes an exact entry first", () => {
    expect(resolveSharedSpecifier("document-model/core", imports)).toBe(
      "https://v/dm-core.js",
    );
  });

  it("maps a subpath through the longest trailing-slash entry", () => {
    expect(resolveSharedSpecifier("zod/mini", imports)).toBe(
      "https://v/zod/mini",
    );
    expect(resolveSharedSpecifier("zod/v4/core", imports)).toBe(
      "https://v/zod4/core",
    );
  });

  it("leaves an unlisted specifier unresolved", () => {
    expect(resolveSharedSpecifier("document-model/mock", imports)).toBe(
      undefined,
    );
    expect(resolveSharedSpecifier("react", imports)).toBe(undefined);
  });
});

describe("ModuleGraph", () => {
  it("rewrites a chunk's bare import behind a minified re-export", async () => {
    const { graph } = graphOver({
      "index.js": 'export*from"./chunk.js";',
      "chunk.js": 'import{marker as m}from"dep";export const value=m;',
    });
    const namespace = await load(graph, "index.js");
    expect(namespace.value).toBe(marker);
  });

  it("loads a chunk two entries share once", async () => {
    const { graph, created } = graphOver({
      "a.js": 'export { instance as a } from "./shared.js";',
      "b.js": 'export { instance as b } from "./shared.js";',
      "shared.js": 'import "dep"; export const instance = {};',
    });
    const [a, b] = await Promise.all([
      load(graph, "a.js"),
      load(graph, "b.js"),
    ]);
    expect(a.a).toBe(b.b);
    expect(created.filter((s) => s.includes("instance = {}"))).toHaveLength(1);
  });

  it("maps subpath imports through prefix entries", async () => {
    const { graph, created } = graphOver(
      {
        "index.js": 'export { sub } from "dep/sub.js"; import "exact/core";',
      },
      { "dep/": "https://v/dep/", "exact/core": sharedSub },
    );
    // A prefix entry's target has no blob to stand in for it, so check the rewrite, not the import.
    await graph.resolve(`${CDN}/index.js`);
    expect(created).toEqual([
      `export { sub } from "https://v/dep/sub.js"; import "${sharedSub}";`,
    ]);
  });

  it("rewrites a dynamic import with a string literal and leaves a computed one", async () => {
    const { graph, warnings } = graphOver({
      "index.js":
        'import "dep"; export const lazy = () => import("./lazy.js"); export const any = (x) => import(x);',
      "lazy.js": 'export { marker } from "dep";',
    });
    const namespace = await load(graph, "index.js");
    const lazy = (await (namespace.lazy as () => Promise<unknown>)()) as {
      marker: object;
    };
    expect(lazy.marker).toBe(marker);
    expect(warnings).toEqual([
      expect.stringContaining("computed specifier") as string,
    ]);
  });

  it("ignores import-like text in strings and comments", async () => {
    const { graph, fetched } = graphOver({
      "index.js": [
        'import { marker } from "dep";',
        "const text = 'import \"./nope.js\"';",
        '// export * from "./nope2.js"',
        "export const value = marker;",
      ].join("\n"),
    });
    const namespace = await load(graph, "index.js");
    expect(namespace.value).toBe(marker);
    expect(fetched).toEqual([`${CDN}/index.js`]);
  });

  it("keeps the URL of a graph with nothing to rewrite", async () => {
    const { graph, created } = graphOver({
      "index.js": 'export * from "./a.js";',
      "a.js": 'export * from "./b.js";',
      "b.js": 'export * from "./a.js"; export const value = 1;',
    });
    expect(await graph.resolve(`${CDN}/index.js`)).toBe(`${CDN}/index.js`);
    expect(created).toEqual([]);
  });

  it("fails on modules that need a rewrite and import each other", async () => {
    const { graph } = graphOver({
      "index.js": 'export * from "./a.js";',
      "a.js": 'export * from "./b.js";',
      "b.js": 'import "dep"; export * from "./a.js";',
    });
    await expect(graph.resolve(`${CDN}/index.js`)).rejects.toThrow(
      `its modules import each other (${CDN}/a.js -> ${CDN}/b.js -> ${CDN}/a.js)`,
    );
  });

  it("fails on a bare import the shared table doesn't list, naming both", async () => {
    const { graph } = graphOver({
      "index.js": 'export * from "./chunk.js";',
      "chunk.js": 'import "dep"; import "react";',
    });
    await expect(graph.resolve(`${CDN}/index.js`)).rejects.toThrow(
      `${CDN}/chunk.js imports "react", which the host doesn't share with the worker`,
    );
  });

  it("retries a module whose fetch failed", async () => {
    const files: Record<string, string> = {};
    const { graph } = graphOver(files);
    await expect(graph.resolve(`${CDN}/index.js`)).rejects.toThrow("404");
    files["index.js"] = 'export { marker } from "dep";';
    const namespace = await load(graph, "index.js");
    expect(namespace.marker).toBe(marker);
  });
});
