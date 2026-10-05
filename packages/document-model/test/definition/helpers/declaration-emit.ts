import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

/** Compile a declaration fixture with the same native TypeScript CLI as the workspace. */
export function emitDeclaration(source: string): {
  readonly declaration: string;
  readonly diagnostics: readonly string[];
  readonly instantiations: number;
} {
  const packageRoot = resolve(import.meta.dirname, "../../..");
  const repositoryRoot = resolve(packageRoot, "../..");
  const cache = join(packageRoot, "test", ".cache");
  mkdirSync(cache, { recursive: true });
  const fixtureRoot = mkdtempSync(join(cache, "declaration-"));
  const fixturePath = join(fixtureRoot, "fixture.ts");
  const outputRoot = join(fixtureRoot, "out");
  try {
    writeFileSync(
      fixturePath,
      source
        .replaceAll(
          '"../../src/',
          `"${join(packageRoot, "src").replaceAll("\\", "/")}/`,
        )
        .replaceAll(
          '"./fixtures/',
          `"${join(packageRoot, "test/definition/fixtures").replaceAll("\\", "/")}/`,
        ),
    );
    const configPath = join(fixtureRoot, "tsconfig.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        extends: join(packageRoot, "tsconfig.json"),
        compilerOptions: {
          composite: false,
          incremental: false,
          declaration: true,
          emitDeclarationOnly: true,
          declarationMap: false,
          rootDir: repositoryRoot,
          outDir: outputRoot,
        },
        include: [],
        exclude: [],
        files: [fixturePath],
        references: [{ path: join(packageRoot, "../shared") }],
      }),
    );
    const result = spawnSync(
      process.execPath,
      [
        join(repositoryRoot, "node_modules/typescript/bin/tsc"),
        "-p",
        configPath,
        "--pretty",
        "false",
        "--extendedDiagnostics",
      ],
      { encoding: "utf8" },
    );
    if (result.error) throw result.error;
    const output = `${result.stdout}${result.stderr}`;
    const declarationPath = join(
      outputRoot,
      relative(repositoryRoot, fixturePath).replace(/\.ts$/, ".d.ts"),
    );
    return {
      declaration: existsSync(declarationPath)
        ? readFileSync(declarationPath, "utf8")
        : "",
      diagnostics: output
        .split("\n")
        .filter((line) => /error TS\d+:/.test(line)),
      instantiations: Number(/Instantiations:\s*(\d+)/.exec(output)?.[1] ?? 0),
    };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}
