import { z } from "zod";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { packageWith, writeTsconfig } from "./declarations.js";
import { siblingPackage, addReference } from "./workspace.js";

export function importRuntime(root: string, specifier: string): void {
  const source = join(root, "src", "invoice.ts");
  writeFileSync(
    source,
    `import { value } from ${JSON.stringify(specifier)};\nif (value !== 42) throw new Error("wrong runtime value");\n${readFileSync(source, "utf8")}`,
  );
}

export function monorepoLoader() {
  const { root } = siblingPackage("code-first");
  writeFileSync(join(dirname(root), "package.json"), '{"type":"module"}\n');
  writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
  const lib = join(dirname(root), "lib");
  addReference(root, lib);
  importRuntime(root, "../../lib/out/index.js");
  return { root, lib };
}

export const loaderCases = [
  "CommonJS reference barrel",
  "CommonJS root barrel",
  "typeless ESM root",
  "typeless ESM reference on disk",
  "computed overlay import",
] as const;

export function loaderPackage(kind: (typeof loaderCases)[number]): string {
  const root =
    kind === "typeless ESM reference on disk"
      ? siblingPackage("code-first").root
      : packageWith("code-first");
  writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
  if (kind === "CommonJS reference barrel") {
    const lib = join(root, "lib");
    addReference(root, lib);
    writeFileSync(join(lib, "package.json"), '{"type":"commonjs"}');
    writeFileSync(join(lib, "index.ts"), 'export * from "./f1.js";\n');
    writeFileSync(
      join(lib, "f1.ts"),
      'function currentThis(this: unknown) { return this; }\nif (currentThis() !== undefined) throw new Error("lost strict mode");\nexport const value = 42;\n',
    );
    importRuntime(root, "../lib/index.js");
  } else if (kind === "typeless ESM reference on disk") {
    const lib = join(dirname(root), "lib");
    addReference(root, lib, {
      compilerOptions: { module: "esnext", moduleResolution: "bundler" },
    });
    writeFileSync(join(lib, "package.json"), "{}");
    importRuntime(root, "../../lib/out/index.js");
  } else if (kind === "computed overlay import") {
    writeFileSync(join(root, "src/runtime.ts"), "export const value = 42;\n");
    const invoice = join(root, "src/invoice.ts");
    writeFileSync(
      invoice,
      'const specifier = "./runtime.js";\nconst { value } = await import(specifier);\nif (value !== 42) throw new Error("wrong computed value");\n' +
        readFileSync(invoice, "utf8"),
    );
  } else {
    const manifest = join(root, "package.json");
    const pkg = z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(readFileSync(manifest, "utf8")));
    if (kind === "CommonJS root barrel") {
      pkg.type = "commonjs";
      writeFileSync(join(root, "src/barrel.ts"), 'export * from "./f1.js";\n');
      writeFileSync(join(root, "src/f1.ts"), "export const value = 42;\n");
      importRuntime(root, "./barrel.js");
      for (const name of ["invoice", "catalog"]) {
        const file = join(root, `src/${name}.ts`);
        writeFileSync(
          file,
          readFileSync(file, "utf8").replaceAll(
            "./invoice.js",
            "./invoice.mjs",
          ),
        );
        renameSync(file, join(root, `src/${name}.mts`));
      }
      const config = join(root, "powerhouse.config.json");
      writeFileSync(
        config,
        readFileSync(config, "utf8").replaceAll(".ts", ".mts"),
      );
      writeFileSync(
        join(root, "index.ts"),
        'export { invoiceFamily } from "./src/invoice.mjs";\n',
      );
      writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false }, [
        "index.ts",
        "src/**/*",
      ]);
    } else {
      delete pkg.type;
      writeTsconfig(root, {
        noEmit: true,
        emitDeclarationOnly: false,
        module: "esnext",
        moduleResolution: "bundler",
      });
    }
    pkg.exports = {
      ".": {
        types: "./types/index.d.ts",
        browser: "./dist/browser/index.mjs",
        import: "./dist/node/index.mjs",
      },
    };
    writeFileSync(manifest, JSON.stringify(pkg));
  }
  return root;
}

export const workspaceCases = [
  "enum",
  "namespace",
  "parameter property",
  "built JavaScript",
] as const;

export function workspaceRuntime(kind: (typeof workspaceCases)[number]) {
  const { root, shared } = siblingPackage("code-first");
  writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
  const scope = join(root, "node_modules", "@review");
  mkdirSync(scope);
  symlinkSync(shared, join(scope, "shared"), "dir");
  const built = kind === "built JavaScript";
  writeFileSync(
    join(shared, "package.json"),
    JSON.stringify({
      name: "@review/shared",
      version: "1.0.0",
      type: "module",
      exports: built
        ? { types: "./index.d.ts", default: "./index.js" }
        : "./index.ts",
    }),
  );
  const source =
    kind === "enum"
      ? "export enum Values { Ready = 42 }\nexport const value = Values.Ready;\n"
      : kind === "namespace"
        ? "export namespace Values { export const Ready = 42; }\nexport const value = Values.Ready;\n"
        : kind === "parameter property"
          ? "export class Value { constructor(public ready: number) {} }\nexport const value = new Value(42).ready;\n"
          : 'throw new Error("source must not load");\nexport const value = 7;\n';
  writeFileSync(join(shared, "index.ts"), source);
  if (built) {
    writeFileSync(join(shared, "index.js"), "export const value = 42;\n");
    writeFileSync(
      join(shared, "index.d.ts"),
      "export declare const value: number;\n",
    );
  }
  importRuntime(root, "@review/shared");
  return { root, shared };
}

export const mutableCases = [
  "local JavaScript",
  "local CommonJS",
  "workspace JavaScript",
  "workspace CommonJS",
] as const;

export function mutableRuntime(kind: (typeof mutableCases)[number]) {
  const workspace = kind.startsWith("workspace");
  const { root, shared } = workspace
    ? siblingPackage("code-first")
    : { root: packageWith("code-first"), shared: undefined };
  writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
  const directory = shared ?? join(root, "src");
  const commonJS = kind.endsWith("CommonJS");
  const extension = commonJS ? "cjs" : "js";
  writeFileSync(
    join(directory, `runtime.${extension}`),
    commonJS
      ? '#!/usr/bin/env node\n// helper\n"custom directive";\n"use strict"\nfunction currentThis() { return this; }\nif (currentThis() !== undefined) throw new Error("lost helper strict mode");\nexports.key = require("./value.cjs").key;\n'
      : 'export { key } from "./value.js";\n',
  );
  writeFileSync(
    join(directory, commonJS ? "runtime.d.cts" : "runtime.d.ts"),
    "export declare const key: string;\n",
  );
  const helper = join(directory, `value.${extension}`);
  const value = (key: string) =>
    `${commonJS ? "exports.key =" : "export const key ="} ${JSON.stringify(key)};\n`;
  writeFileSync(helper, value("test/invoice"));
  if (shared !== undefined) {
    writeFileSync(
      join(shared, "package.json"),
      JSON.stringify({
        name: "@review/shared",
        type: "module",
        exports: {
          types: commonJS ? "./runtime.d.cts" : "./runtime.d.ts",
          default: `./runtime.${extension}`,
        },
      }),
    );
    const scope = join(root, "node_modules", "@review");
    mkdirSync(scope);
    symlinkSync(shared, join(scope, "shared"), "dir");
  }
  const invoice = join(root, "src/invoice.ts");
  const specifier = workspace ? "@review/shared" : `./runtime.${extension}`;
  writeFileSync(
    invoice,
    `import { key } from ${JSON.stringify(specifier)};\n${readFileSync(invoice, "utf8").replaceAll('"test/invoice"', "key")}`,
  );
  return {
    root,
    helper,
    edit: () => writeFileSync(helper, value("test/invoice-next")),
  };
}

export const runtimeApprovalCases = [
  "workspace JavaScript",
  "transitive JavaScript",
  "transitive CommonJS",
] as const;

export function workspaceApproval(kind: (typeof runtimeApprovalCases)[number]) {
  const { root, shared } = siblingPackage("code-first");
  writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
  const commonJS = kind === "transitive CommonJS";
  const extension = commonJS ? "cjs" : "js";
  const runtime = join(shared, `index.${extension}`);
  const helper = join(shared, `value.${extension}`);
  const value = (key: string) =>
    `${commonJS ? "exports.key =" : "export const key ="} ${JSON.stringify(key)};\n`;
  writeFileSync(
    runtime,
    kind === "workspace JavaScript"
      ? value("test/invoice")
      : commonJS
        ? 'exports.key = require("./value.cjs").key;\n'
        : 'export { key } from "./value.js";\n',
  );
  writeFileSync(helper, value("test/invoice"));
  writeFileSync(
    join(shared, commonJS ? "index.d.cts" : "index.d.ts"),
    "export declare const key: string;\n",
  );
  writeFileSync(
    join(shared, "package.json"),
    JSON.stringify({
      name: "@review/shared",
      type: "module",
      exports: {
        types: commonJS ? "./index.d.cts" : "./index.d.ts",
        default: `./index.${extension}`,
      },
    }),
  );
  const scope = join(root, "node_modules/@review");
  mkdirSync(scope);
  symlinkSync(shared, join(scope, "shared"), "dir");
  const invoice = join(root, "src/invoice.ts");
  writeFileSync(
    invoice,
    'import { key } from "@review/shared";\n' +
      readFileSync(invoice, "utf8").replaceAll('id: "test/invoice"', "id: key"),
  );
  const changed = kind === "workspace JavaScript" ? runtime : helper;
  return {
    root,
    runtime,
    helper,
    changed,
    edit: () => writeFileSync(changed, value("test/wrong")),
  };
}

export function typedRuntimeAlias(): string {
  const root = packageWith("code-first");
  writeTsconfig(root, {
    noEmit: true,
    emitDeclarationOnly: false,
    module: "esnext",
    moduleResolution: "bundler",
    paths: { "runtime-alias": ["./src/runtime"] },
  });
  writeFileSync(join(root, "src/runtime.js"), "export const value = 42;\n");
  writeFileSync(
    join(root, "src/runtime.d.ts"),
    "export declare const value: number;\n",
  );
  importRuntime(root, "runtime-alias");
  return root;
}
