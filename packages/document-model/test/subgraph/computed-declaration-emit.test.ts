import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const repositoryRoot = resolve(packageRoot, "../..");

/**
 * Emits declarations for a module outside this package that imports
 * `document-model` through node_modules, as a subgraph package does. A
 * fixture inside the package would reach every type by a relative path and
 * could never report TS2883.
 */
function emitConsumerDeclaration(source: string) {
  const root = mkdtempSync(join(tmpdir(), "document-model-consumer-"));
  try {
    mkdirSync(join(root, "node_modules"));
    symlinkSync(packageRoot, join(root, "node_modules", "document-model"));
    writeFileSync(join(root, "package.json"), '{ "type": "module" }');
    writeFileSync(join(root, "fixture.ts"), source);
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        extends: join(repositoryRoot, "tsconfig.options.json"),
        compilerOptions: {
          customConditions: [],
          composite: false,
          incremental: false,
          declaration: true,
          emitDeclarationOnly: true,
          declarationMap: false,
          sourceMap: false,
          types: ["node"],
          typeRoots: [join(repositoryRoot, "node_modules/@types")],
          skipLibCheck: true,
          rootDir: root,
          outDir: join(root, "out"),
        },
        files: [join(root, "fixture.ts")],
      }),
    );
    const result = spawnSync(
      process.execPath,
      [
        join(repositoryRoot, "node_modules/typescript/bin/tsc"),
        "-p",
        join(root, "tsconfig.json"),
        "--pretty",
        "false",
      ],
      { encoding: "utf8" },
    );
    if (result.error) throw result.error;
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    return readFileSync(join(root, "out", "fixture.d.ts"), "utf8");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

it("emits declarations for an exported object with computed fields", () => {
  const declaration = emitConsumerDeclaration(`
import { ph } from "document-model";

export const PostQueries = ph.object("PostQueries", {
  fields: {
    count: ph.field({
      args: { since: ph.DateTime() },
      returns: ph.Int({ required: true }),
    }),
  },
});

export const countToken = PostQueries.computedTokens.count;
`);
  expect(declaration).toContain(
    'import("document-model").ComputedFieldDescriptor<',
  );
  expect(declaration).toContain('import("document-model").ComputedToken<');
}, 120_000);
