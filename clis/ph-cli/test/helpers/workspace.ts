import { z } from "zod";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import {
  declarationFiles,
  disposals,
  packageWith,
  type Flow,
  writeTsconfig,
} from "./declarations.js";

export function plainCompile(root: string) {
  const result = spawnSync(
    process.execPath,
    [join(root, "node_modules", "typescript", "bin", "tsc"), "--build"],
    { cwd: root, env: { ...process.env, PWD: root }, encoding: "utf8" },
  );
  return { status: result.status, output: result.stdout + result.stderr };
}

export function declarationSnapshot(root: string): Record<string, string> {
  return Object.fromEntries(
    declarationFiles(root).map((file) => [
      file,
      readFileSync(join(root, file), "utf8"),
    ]),
  );
}

export function siblingPackage(flow: Flow): { root: string; shared: string } {
  const source = packageWith(flow);
  const parent = mkdtempSync(join(tmpdir(), "ph-compile-boundary-"));
  disposals.push(() => rmSync(parent, { recursive: true, force: true }));
  const root = resolve(parent, "package");
  renameSync(source, root);
  const shared = join(parent, "shared");
  mkdirSync(shared);
  writeFileSync(join(shared, "x.ts"), "export const value = 42;\n");
  return { root, shared };
}

export function recordTsc(root: string): () => string[][] {
  const bin = join(root, "node_modules/.bin/tsc");
  const compiler = join(root, "node_modules/typescript/bin/tsc");
  const commandsFile = join(root, "node_modules/commands.jsonl");
  writeFileSync(commandsFile, "");
  rmSync(bin);
  writeFileSync(
    bin,
    [
      "#!/usr/bin/env node",
      `require("node:fs").appendFileSync(${JSON.stringify(commandsFile)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
      `const result = require("node:child_process").spawnSync(process.execPath, [${JSON.stringify(compiler)}, ...process.argv.slice(2)], { stdio: "inherit" });`,
      "process.exit(result.status ?? 1);",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);
  return () =>
    readFileSync(commandsFile, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => z.array(z.string()).parse(JSON.parse(line)));
}

export function addReference(
  root: string,
  directory: string,
  options: {
    readonly compilerOptions?: Record<string, unknown>;
    readonly files?: readonly string[];
    readonly source?: string;
  } = {},
): void {
  const target = resolve(root, directory);
  mkdirSync(target, { recursive: true });
  writeFileSync(
    join(target, "index.ts"),
    options.source ?? "export const value = 42;\n",
  );
  writeFileSync(
    join(target, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        composite: true,
        rootDir: ".",
        outDir: "out",
        module: "nodenext",
        target: "esnext",
        ...options.compilerOptions,
      },
      ...(options.files === undefined
        ? { include: ["*.ts"] }
        : { files: options.files }),
    }),
  );
  const file = join(root, "tsconfig.json");
  const config = z
    .looseObject({
      references: z.array(z.object({ path: z.string() })).optional(),
    })
    .parse(JSON.parse(readFileSync(file, "utf8")));
  config.references = [...(config.references ?? []), { path: directory }];
  writeFileSync(file, JSON.stringify(config));
}

export function duplicatePackages(): string {
  const root = packageWith("code-first");
  writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
  for (const name of ["pa", "pb"]) {
    const dependency = join(root, "node_modules", name);
    const typing = join(dependency, "node_modules", "typ");
    mkdirSync(typing, { recursive: true });
    writeFileSync(
      join(dependency, "package.json"),
      JSON.stringify({ name, version: "1.0.0", types: "index.d.ts" }),
    );
    writeFileSync(
      join(dependency, "index.d.ts"),
      'export type { Value } from "typ";\n',
    );
    writeFileSync(
      join(typing, "package.json"),
      '{"name":"typ","version":"1.0.0","types":"index.d.ts"}',
    );
    writeFileSync(join(typing, "index.d.ts"), "export type Value = number;\n");
  }
  writeFileSync(
    join(root, "src/duplicates.ts"),
    'import type { Value as A } from "pa";\nimport type { Value as B } from "pb";\nexport const values: [A, B] = [42, 42];\n',
  );
  return root;
}

export function noInputProbe(kind: "relative" | "configDir") {
  const { root, shared } = siblingPackage("schema-first");
  const compiler = resolve(
    import.meta.dirname,
    "../../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript",
  );
  rmSync(join(root, "node_modules/typescript"));
  rmSync(join(root, "node_modules/.bin/tsc"));
  symlinkSync(compiler, join(root, "node_modules/typescript"), "dir");
  symlinkSync(join(compiler, "bin/tsc"), join(root, "node_modules/.bin/tsc"));
  const sentinel = join(shared, "x.tsbuildinfo");
  writeFileSync(sentinel, "protected\n");
  writeFileSync(
    join(dirname(root), "base.json"),
    JSON.stringify({
      compilerOptions: {
        composite: true,
        noEmit: true,
        tsBuildInfoFile:
          kind === "relative"
            ? "./shared/x.tsbuildinfo"
            : "${configDir}/../shared/x.tsbuildinfo",
      },
    }),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ extends: "../base.json", include: ["missing/*.ts"] }),
  );
  return { root, sentinel };
}
