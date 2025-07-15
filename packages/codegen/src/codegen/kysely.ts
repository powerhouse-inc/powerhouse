import { spawn } from "node:child_process";
import { resolve } from "node:path";

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
    // Use kysely-pglite CLI to handle TypeScript compilation and module resolution
    await runCommand(
      "npx",
      ["kysely-pglite", migrationFile, "--outFile", outFile],
      process.cwd(),
    );

    console.log(`Schema types generated at ${outFile}`);
  } catch (error) {
    console.error("Error running migration:", error);
    throw error;
  }
}
