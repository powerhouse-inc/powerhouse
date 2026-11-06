import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PACKAGES = join(import.meta.dirname, "..", "..", "..");
const WORKSPACE = [
  { name: "document-model", root: join(PACKAGES, "document-model") },
  { name: "@powerhousedao/shared", root: join(PACKAGES, "shared") },
];
const TSC = join(
  dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
  "bin",
  "tsc",
);

type Manifest = {
  exports: Record<string, Record<string, string>>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

let scratch: string | undefined;
let consumer: string;
let installed: Manifest;

const nodeModule = (name: string) =>
  join(consumer, "node_modules", ...name.split("/"));

function resolvedFrom(from: string, name: string): string | undefined {
  for (let directory = from; ; directory = dirname(directory)) {
    const candidate = join(directory, "node_modules", ...name.split("/"));
    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync.native(candidate);
    }
    if (dirname(directory) === directory) return undefined;
  }
}

function link(name: string, target: string): void {
  const at = nodeModule(name);
  if (existsSync(at)) return;
  mkdirSync(dirname(at), { recursive: true });
  symlinkSync(target, at, process.platform === "win32" ? "junction" : "dir");
}

beforeAll(() => {
  scratch = realpathSync.native(mkdtempSync(join(tmpdir(), "dm-packed-")));
  consumer = join(scratch, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify({ name: "packed-consumer", private: true, type: "module" })}\n`,
  );
  for (const { name, root } of WORKSPACE) {
    const tarballs = join(scratch, "tarballs", name);
    mkdirSync(tarballs, { recursive: true });
    // pnpm pack rewrites workspace: ranges, as the release does.
    execFileSync("pnpm", ["pack", "--pack-destination", tarballs], {
      cwd: root,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    const [tarball] = readdirSync(tarballs);
    mkdirSync(nodeModule(name), { recursive: true });
    execFileSync("tar", [
      "-xzf",
      join(tarballs, tarball),
      "--strip-components=1",
      "-C",
      nodeModule(name),
    ]);
  }
  for (const { name, root } of WORKSPACE) {
    const manifest = JSON.parse(
      readFileSync(join(nodeModule(name), "package.json"), "utf8"),
    ) as Manifest;
    if (name === "document-model") installed = manifest;
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    })) {
      const target = resolvedFrom(root, dependency);
      if (target !== undefined) link(dependency, target);
    }
  }
  const types = resolvedFrom(WORKSPACE[0].root, "@types/node");
  if (types !== undefined) link("@types/node", types);
}, 300_000);

afterAll(() => {
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
});

function packageOf(url: string): string | undefined {
  if (!url.startsWith("file:")) return undefined;
  const file = fileURLToPath(url);
  if (!existsSync(file)) return undefined;
  const path = realpathSync.native(file);
  const inside = path.split(`${sep}node_modules${sep}`);
  if (inside.length === 1) return undefined;
  const [scope, base] = inside[inside.length - 1].split(sep);
  return scope.startsWith("@") ? `${scope}/${base}` : scope;
}

function run(
  source: string,
  conditions: readonly string[] = [],
): {
  readonly value: unknown;
  readonly packages: readonly string[];
  readonly builtinImporters: readonly string[];
} {
  const file = join(consumer, `run-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(
    file,
    `import { registerHooks } from "node:module";
const resolved = [];
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    resolved.push([result.url, context.parentURL]);
    return result;
  },
});
const value = await (async () => {
${source}
})();
process.stdout.write(JSON.stringify({ value, resolved }));
`,
  );
  const stdout = execFileSync(
    process.execPath,
    [...conditions.map((condition) => `--conditions=${condition}`), file],
    { cwd: consumer, encoding: "utf8" },
  );
  const { value, resolved } = JSON.parse(stdout) as {
    value: unknown;
    resolved: [string, string | undefined][];
  };
  const sorted = (names: (string | undefined)[]) =>
    [...new Set(names.filter((name) => name !== undefined))].sort();
  return {
    value,
    packages: sorted(resolved.map(([url]) => packageOf(url))),
    builtinImporters: sorted(
      resolved
        .filter(([url]) => url.startsWith("node:"))
        .map(([, parent]) => (parent ? packageOf(parent) : undefined)),
    ),
  };
}

const GRAPHQL = /^(graphql|@graphql-tools\/.*|@apollo\/.*)$/;

describe("the packed document-model", () => {
  it("contains every file its exports map names but those of ./test, which its build does not emit", () => {
    const missing = Object.entries(installed.exports).flatMap(
      ([subpath, conditions]) =>
        Object.entries(conditions)
          .filter(([condition]) => condition !== "source")
          .filter(
            ([, target]) =>
              !existsSync(join(nodeModule("document-model"), target)),
          )
          .map(([condition, target]) => `${subpath} ${condition} ${target}`),
    );

    expect(missing).toEqual([
      "./test import ./dist/test/index.js",
      "./test types ./dist/test/index.d.ts",
    ]);
  });

  it("imports in Node, with ./tooling, and loads no GraphQL implementation", () => {
    const { value, packages } = run(`
const model = await import("document-model");
const tooling = await import("document-model/tooling");
return {
  model: typeof model.baseCreateDocument,
  tooling: Object.keys(tooling).length > 0,
};`);

    expect(value).toEqual({ model: "function", tooling: true });
    expect(packages).toContain("document-model");
    expect(packages).toContain("@powerhousedao/shared");
    expect(packages.filter((name) => GRAPHQL.test(name))).toEqual([]);
  });

  it("imports under browser conditions with no Node built-in of its own and no GraphQL implementation", () => {
    const { value, packages, builtinImporters } = run(
      `const model = await import("document-model");
return typeof model.baseCreateDocument;`,
      ["browser"],
    );

    expect(value).toBe("function");
    expect(packages).toContain("document-model");
    expect(packages.filter((name) => GRAPHQL.test(name))).toEqual([]);
    // Node applies its own "node" condition too, so a dependency with a Node
    // variant still picks it here; a bundler would not.
    expect(builtinImporters).toEqual(["@noble/hashes", "fflate"]);
  });

  it("typechecks a Node consumer and a browser-bundler consumer against the packed declarations", () => {
    writeFileSync(
      join(consumer, "node-consumer.ts"),
      `import { baseCreateDocument, type PHDocument } from "document-model";
import * as tooling from "document-model/tooling";

export const create: typeof baseCreateDocument = baseCreateDocument;
export type Document = PHDocument;
export const toolingExports: readonly string[] = Object.keys(tooling);
`,
    );
    writeFileSync(
      join(consumer, "browser-consumer.ts"),
      `import { baseCreateDocument, type PHDocument } from "document-model";

export const create: typeof baseCreateDocument = baseCreateDocument;
export type Document = PHDocument;
`,
    );
    const config = (name: string, options: object, include: string) =>
      writeFileSync(
        join(consumer, name),
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022", "DOM"],
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            ...options,
          },
          include: [include],
        }),
      );
    config(
      "tsconfig.node.json",
      { module: "NodeNext", moduleResolution: "NodeNext", types: ["node"] },
      "node-consumer.ts",
    );
    config(
      "tsconfig.browser.json",
      {
        module: "Preserve",
        moduleResolution: "bundler",
        customConditions: ["browser"],
        types: [],
      },
      "browser-consumer.ts",
    );

    for (const project of ["tsconfig.node.json", "tsconfig.browser.json"]) {
      let output = "";
      try {
        execFileSync(process.execPath, [TSC, "-p", project], {
          cwd: consumer,
          encoding: "utf8",
        });
      } catch (error) {
        output = String((error as { stdout?: string }).stdout ?? error);
      }
      expect(output, project).toBe("");
    }
  }, 120_000);
});
