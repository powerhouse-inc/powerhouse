import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";

// Resolved from codegen's own install, which depends on kysely-pglite.
function getKyselyPgLiteBin(): string {
  const require = createRequire(import.meta.url);

  const paths = require.resolve.paths("kysely-pglite");
  if (paths) {
    for (const basePath of paths) {
      const pkgRoot = join(basePath, "kysely-pglite");
      const binPath = join(pkgRoot, "bin/run.js");

      if (existsSync(binPath)) {
        return binPath;
      }
    }
  }

  throw new Error("Could not find kysely-pglite/bin/run.js");
}

export interface IOptions {
  migrationFile: string;
  schemaFile?: string;
}

function runCommand(
  command: string,
  args: string[],
  cwd?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

/** Renames the table interfaces `DB` maps to `<Name>Table`, so they don't share the processor class's name. */
export function suffixTableTypes(source: string): string {
  const db = /export interface DB \{([^}]*)\}/.exec(source);
  if (!db) return source;
  const names = new Set(
    [...db[1].matchAll(/:\s*(\w+);/g)]
      .map(([, name]) => name)
      .filter((name) => !name.endsWith("Table")),
  );
  let result = source.replace(/export interface DB \{[^}]*\}/, (body) =>
    body.replace(/:\s*(\w+);/g, (field, name: string) =>
      names.has(name) ? field.replace(name, `${name}Table`) : field,
    ),
  );
  for (const name of names) {
    result = result.replace(
      new RegExp(`export interface ${name} \\{`),
      `export interface ${name}Table {`,
    );
  }
  return result;
}

export async function generateDBSchema({
  migrationFile,
  schemaFile,
}: IOptions) {
  const outFile = resolve(schemaFile ?? resolve(migrationFile, "../schema.ts"));

  const kyselyBinPath = getKyselyPgLiteBin();
  // Use kysely-pglite CLI to handle TypeScript compilation and module resolution.
  // It globs the path it is given, and a glob reads a Windows path's
  // backslashes as escapes, matches nothing and exits 0. So it runs in the
  // migration file's directory and gets only the file name.
  await runCommand(
    process.execPath,
    [kyselyBinPath, basename(migrationFile), "--outFile", outFile],
    dirname(migrationFile),
  ).catch((error: Error) => {
    throw new Error(`Could not generate ${outFile}: ${error.message}`, {
      cause: error,
    });
  });

  writeFileSync(outFile, suffixTableTypes(readFileSync(outFile, "utf8")));
  console.log(`Schema types generated at ${outFile}`);
}
