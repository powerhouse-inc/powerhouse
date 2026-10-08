import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function createCodeFirstPackage(): string {
  const projectDir = mkdtempSync(join(tmpdir(), "ph-code-first-"));
  mkdirSync(join(projectDir, "document-models"), { recursive: true });
  mkdirSync(join(projectDir, "node_modules", "@powerhousedao"), {
    recursive: true,
  });
  symlinkSync(
    fileURLToPath(new URL("../../document-model", import.meta.url)),
    join(projectDir, "node_modules", "document-model"),
    "junction",
  );
  for (const name of ["shared", "reactor-api"])
    symlinkSync(
      fileURLToPath(new URL(`../../${name}`, import.meta.url)),
      join(projectDir, "node_modules", "@powerhousedao", name),
      "junction",
    );
  writeFileSync(
    join(projectDir, "package.json"),
    JSON.stringify({ name: "@acme/things", type: "module" }),
  );
  writeFileSync(
    join(projectDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "nodenext", moduleResolution: "nodenext" },
    }),
  );
  writeFileSync(
    join(projectDir, "powerhouse.config.json"),
    `${JSON.stringify({ documentModelsDir: "./document-models" }, null, 2)}\n`,
  );
  return projectDir;
}
