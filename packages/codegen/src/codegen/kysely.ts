import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

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
      shell: true,
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

export async function generateDBSchema({
  migrationFile,
  schemaFile,
}: IOptions) {
  const outFile = schemaFile ?? resolve(migrationFile, "../schema.ts");

  try {
    const kyselyBinPath = getKyselyPgLiteBin();
    // Use kysely-pglite CLI to handle TypeScript compilation and module resolution
    await runCommand(
      "node",
      [kyselyBinPath, migrationFile, "--outFile", outFile],
      process.cwd(),
    );

    console.log(`Schema types generated at ${outFile}`);
  } catch (error) {
    console.error("Error running migration:", error);
  }
}
