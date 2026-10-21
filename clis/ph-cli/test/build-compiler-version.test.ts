import { writeCmdShim } from "./helpers/workspace.js";
import {
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, expect } from "vitest";
import {
  build,
  cleanUp,
  itWithSymlinks,
  packageWith,
  writeTsconfig,
} from "./helpers/declarations.js";

afterEach(cleanUp);

function advertisedVersion(root: string, version: string): void {
  const bin = join(root, "node_modules", ".bin", "tsc");
  rmSync(bin);
  writeFileSync(
    bin,
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      "const args = process.argv.slice(2);",
      `if (args.includes("--version")) { console.log(${JSON.stringify(`Version ${version}`)}); process.exit(0); }`,
      'const project = args[args.indexOf("-p") + 1];',
      'if (project && path.isAbsolute(project) && fs.readFileSync(project, "utf8").includes("\\"noCheck\\":true")) fs.writeFileSync("loader-ran.txt", "unexpected");',
      'const result = require("node:child_process").spawnSync(process.execPath, [path.join(process.cwd(), "node_modules", "typescript", "bin", "tsc"), ...args], { stdio: "inherit" });',
      "process.exit(result.status ?? 1);",
      "",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);
  writeCmdShim(bin);
}

itWithSymlinks.each([
  { version: "5.5.4", options: {}, message: "TypeScript 5.6 or newer" },
  {
    version: "5.6.3",
    options: {
      allowImportingTsExtensions: true,
      noEmit: true,
      emitDeclarationOnly: false,
    },
    message: "TypeScript 5.7 or newer",
  },
])(
  "refuses code-first loader emission on $version before writing any output",
  async ({ version, options, message }) => {
    const root = packageWith("code-first");
    writeTsconfig(root, {
      declaration: true,
      declarationDir: "types",
      ...options,
    });
    advertisedVersion(root, version);
    const result = await build(root, "code-first", "dist", undefined, true);
    expect(result.exitCode).toBe(2);
    expect(result.log).toContain(message);
    for (const file of [
      "dist",
      "types",
      ".ph",
      "tsconfig.tsbuildinfo",
      "loader-ran.txt",
    ])
      expect(existsSync(join(root, file))).toBe(false);
  },
  120_000,
);

itWithSymlinks(
  "skips the private emit for schema-first on an older compiler",
  async () => {
    const root = packageWith("schema-first");
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    advertisedVersion(root, "5.5.4");
    const result = await build(root, "schema-first");
    expect(result.exitCode, result.log).toBe(0);
    expect(existsSync(join(root, "loader-ran.txt"))).toBe(false);
    expect(readFileSync(join(root, "types", "src", "shape.d.ts"), "utf8")).toBe(
      "export type Shape = {\n    a: string;\n};\n",
    );
  },
  120_000,
);
