// Self-host React: emit the React family into the Connect dist and point the
// page import map at it, instead of resolving react/react-dom from esm.sh.
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname as pathDirname, join, resolve } from "node:path";
import type { Plugin } from "vite";

// URL path (under base) the React bundle is emitted/served at.
const REACT_URL_DIR = "__react__";

// Packages whose every browser-importable subpath is self-hosted.
const REACT_PACKAGES = ["react", "react-dom"];

// Resolve an exports value to its browser-preferred target, or null.
function importTarget(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  for (const c of ["browser", "import", "module", "default"]) {
    if (c in o) {
      const t = importTarget(o[c]);
      if (t) return t;
    }
  }
  return null;
}

// All browser-usable subpaths of react/react-dom, mapped to the absolute file
// their browser condition resolves to. Node/bun-only targets are skipped.
function resolveReactEntries(dirname: string): Record<string, string> {
  const require = createRequire(join(dirname, "noop.js"));
  const out: Record<string, string> = {};
  for (const pkg of REACT_PACKAGES) {
    let pkgRoot: string;
    let exp: unknown;
    try {
      const pkgJsonPath = require.resolve(`${pkg}/package.json`);
      pkgRoot = pathDirname(pkgJsonPath);
      exp = JSON.parse(readFileSync(pkgJsonPath, "utf8")).exports;
    } catch {
      continue;
    }
    if (!exp || typeof exp !== "object") continue;
    for (const key of Object.keys(exp as Record<string, unknown>)) {
      if (key === "./package.json" || key.includes("*")) continue;
      const target = importTarget((exp as Record<string, unknown>)[key]);
      // Skip non-JS and runtime-only (node/bun) targets — unusable in a browser.
      if (!target || /\.(json|css)$/.test(target)) continue;
      if (/\.(node|bun)\.js$/.test(target)) continue;
      const file = join(pkgRoot, target);
      if (!existsSync(file)) continue;
      out[key === "." ? pkg : `${pkg}${key.slice(1)}`] = file;
    }
  }
  return out;
}

export interface ReactSelfHostOptions {
  // Project root used to resolve react/react-dom and run the sub-build.
  dirname: string;
  // Emit the development React build (warnings/act) instead of production.
  dev?: boolean;
}

// Emits one React variant (dev or prod, per options.dev) into the dist and
// injects a static import map pointing every react/react-dom subpath at it.
export function reactSelfHostPlugin(options: ReactSelfHostOptions): Plugin {
  const entries = resolveReactEntries(options.dirname);
  let absOutDir = resolve(options.dirname, "dist");
  let importMap: Record<string, string> = {};
  return {
    name: "ph-react-self-host",
    apply: "build",
    configResolved(config) {
      absOutDir = resolve(config.root, config.build.outDir);
      // Entry URLs mirror the specifier (react-dom/client -> __react__/react-dom/client.js)
      // so the trailing-slash catch-alls below resolve any subpath to the same file.
      importMap = Object.fromEntries(
        Object.keys(entries).map((spec) => [
          spec,
          `${config.base}${REACT_URL_DIR}/${spec}.js`,
        ]),
      );
      // Catch-all per package: an unenumerated react/* import resolves to the single
      // self-hosted instance (same-origin) instead of failing import-map resolution.
      for (const pkg of REACT_PACKAGES) {
        importMap[`${pkg}/`] = `${config.base}${REACT_URL_DIR}/${pkg}/`;
      }
    },
    transformIndexHtml() {
      if (!Object.keys(importMap).length) return;
      return [
        {
          tag: "script",
          attrs: { type: "importmap" },
          children: JSON.stringify({ imports: importMap }),
          injectTo: "head-prepend",
        },
      ];
    },
    async closeBundle() {
      if (!Object.keys(entries).length) return;
      const { ok, stderr } = await runReactBuild(
        options.dirname,
        join(absOutDir, REACT_URL_DIR),
        entries,
        options.dev ? "development" : "production",
      );
      if (!ok) {
        this.error(
          `react self-host build failed${stderr.trim() ? `:\n${stderr.trim()}` : ""}`,
        );
      }
    },
  };
}

// Spawn a throwaway worker that builds the React family; peak build memory is
// reclaimed when the subprocess exits.
function runReactBuild(
  dirname: string,
  outDir: string,
  entries: Record<string, string>,
  nodeEnv: "development" | "production",
): Promise<{ ok: boolean; stderr: string }> {
  mkdirSync(outDir, { recursive: true });
  const workerPath = join(outDir, "build-worker.mjs");
  writeFileSync(workerPath, REACT_BUILD_WORKER);
  return new Promise((resolvePromise) => {
    const child = spawn(
      process.execPath,
      [workerPath, dirname, outDir, JSON.stringify(entries), nodeEnv],
      { cwd: dirname, stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    const done = (r: { ok: boolean; stderr: string }) => {
      rmSync(workerPath, { force: true });
      resolvePromise(r);
    };
    child.on("exit", (code) => done({ ok: code === 0, stderr: out }));
    child.on("error", (e) => done({ ok: false, stderr: String(e) }));
  });
}

// Worker: one ESM entry per subpath with explicit named re-exports. Names come
// from the browser-resolved file (node names differ for server/static).
const REACT_BUILD_WORKER = `
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [dirname, outDir, entriesJSON, nodeEnv] = process.argv.slice(2);
const entries = JSON.parse(entriesJSON);
const reqProj = createRequire(join(dirname, 'noop.js'));
const { build } = await import(reqProj.resolve('vite'));
const srcDir = join(outDir, '.entries');
mkdirSync(srcDir, { recursive: true });
const entryName = (spec) => spec.replace(/[^\\w]+/g, '_');
const RESERVED = new Set('enum void null function in instanceof typeof new delete do if else return switch case break continue for while this true false class const let var default export import extends super with yield debugger finally throw try catch await implements interface package private protected public static eval arguments'.split(' '));
const input = {};
for (const [spec, file] of Object.entries(entries)) {
  const name = entryName(spec);
  let names = [];
  try {
    const ns = await import(pathToFileURL(file).href);
    const obj = (ns.default && typeof ns.default === 'object') ? ns.default : ns;
    names = Object.keys(obj).filter((k) => k !== 'default' && k !== '__esModule' && /^[A-Za-z_$][\\w$]*$/.test(k));
  } catch {}
  const plain = names.filter((n) => !RESERVED.has(n));
  const reserved = names.filter((n) => RESERVED.has(n));
  let src = 'import __m from ' + JSON.stringify(spec) + ';\\nexport default __m;\\n';
  if (plain.length) src += 'export const { ' + plain.join(', ') + ' } = __m;\\n';
  reserved.forEach((n, i) => {
    src += 'const __r' + i + ' = __m[' + JSON.stringify(n) + '];\\nexport { __r' + i + ' as ' + n + ' };\\n';
  });
  const entryFile = join(srcDir, name + '.js');
  writeFileSync(entryFile, src);
  // Key by the full spec so the output path mirrors the subpath
  // (react-dom/client -> react-dom/client.js), matching the catch-all import map.
  input[spec] = entryFile;
}
await build({
  root: dirname, configFile: false, logLevel: 'error',
  base: './', publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify(nodeEnv) },
  resolve: { conditions: ['browser', 'import', 'module', 'default'] },
  build: {
    outDir, emptyOutDir: false, minify: nodeEnv === 'production', target: 'esnext',
    rollupOptions: {
      input, preserveEntrySignatures: 'strict',
      output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  },
});
rmSync(srcDir, { recursive: true, force: true });
`;
