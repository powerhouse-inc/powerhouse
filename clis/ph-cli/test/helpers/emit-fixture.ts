import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTypecheckStep } from "../../src/services/definitions/build-steps.js";

export async function emitFixture(packageRoot: string, emittedRoot: string) {
  return await createTypecheckStep("npm", "dist")({ packageRoot, emittedRoot });
}

export function writeFixtureTsconfig(packageRoot: string): void {
  writeFileSync(
    join(packageRoot, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          rootDir: ".",
          module: "nodenext",
          moduleResolution: "nodenext",
          target: "esnext",
          declaration: true,
          declarationDir: "./dist/types",
          emitDeclarationOnly: true,
          incremental: true,
          strict: false,
          skipLibCheck: true,
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  );
}
