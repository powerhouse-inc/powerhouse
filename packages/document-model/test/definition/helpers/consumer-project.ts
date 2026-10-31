import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "../../..");
const repositoryRoot = resolve(packageRoot, "../..");

export function compileConsumer(files: {
  readonly "consumer.ts": string;
  readonly [name: string]: string;
}): {
  readonly declaration: string;
  readonly diagnostics: readonly string[];
} {
  const cache = join(packageRoot, "test", ".cache");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(join(cache, "consumer-"));
  try {
    const modules = join(root, "node_modules");
    const library = join(modules, "document-model");
    mkdirSync(join(modules, "@powerhousedao"), { recursive: true });
    mkdirSync(library);
    writeFileSync(
      join(library, "package.json"),
      JSON.stringify({
        name: "document-model",
        type: "module",
        exports: { ".": "./index.ts", "./scalars": "./scalars.ts" },
      }),
    );
    for (const entry of ["index.ts", "scalars.ts"]) {
      symlinkSync(join(packageRoot, entry), join(library, entry));
    }
    symlinkSync(join(packageRoot, "src"), join(library, "src"));
    for (const dependency of ["@powerhousedao/shared", "zod", "change-case"]) {
      symlinkSync(
        join(packageRoot, "node_modules", dependency),
        join(modules, dependency),
      );
    }
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "consumer", type: "module" }),
    );
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(root, name), source);
    }
    const compilerOptions = {
      module: "NodeNext",
      target: "ESNext",
      strict: true,
      skipLibCheck: true,
      preserveSymlinks: true,
      verbatimModuleSyntax: true,
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      rootDir: root,
      outDir: join(root, "out"),
      types: [],
    };
    const run = (config: string, include: readonly string[]) => {
      writeFileSync(
        join(root, config),
        JSON.stringify({ compilerOptions, files: include }),
      );
      const result = spawnSync(
        process.execPath,
        [
          join(repositoryRoot, "node_modules/typescript/bin/tsc"),
          "-p",
          join(root, config),
          "--pretty",
          "false",
        ],
        { encoding: "utf8" },
      );
      if (result.error) throw result.error;
      return `${result.stdout}${result.stderr}`
        .split("\n")
        .filter((line) => /error TS\d+:/.test(line))
        .map((line) => line.replace(root, "<consumer>"));
    };
    const emitted = run("tsconfig.emit.json", ["consumer.ts"]);
    const declarationPath = join(root, "out", "consumer.d.ts");
    const declaration = existsSync(declarationPath)
      ? readFileSync(declarationPath, "utf8")
      : "";
    writeFileSync(join(root, "consumer.d.ts"), declaration);
    rmSync(join(root, "consumer.ts"));
    const users = Object.keys(files).filter((name) => name !== "consumer.ts");
    const checked = users.length === 0 ? [] : run("tsconfig.use.json", users);
    return { declaration, diagnostics: [...emitted, ...checked] };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
