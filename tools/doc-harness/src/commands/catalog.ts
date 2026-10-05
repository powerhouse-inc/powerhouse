import type { Command } from "commander";
import { loadCatalog, validateCatalogFiles } from "../lib/catalog.js";

export function register(program: Command): void {
  const catalog = program
    .command("catalog")
    .description("Inspect the task catalog");

  catalog
    .command("list")
    .description("List tasks with difficulty, arms and acceptance kind")
    .action(() => {
      const { pin, tasks } = loadCatalog();
      process.stdout.write(`pin ${pin}\n`);
      for (const t of tasks) {
        process.stdout.write(
          `${t.id.padEnd(28)} ${t.difficulty}  arms ${t.arms.join("")}  ${t.acceptance.kind.padEnd(9)} ${t.title}\n`,
        );
      }
    });

  catalog
    .command("validate")
    .description(
      "Schema-check the catalog and confirm every pinned file exists",
    )
    .action(() => {
      const parsed = loadCatalog();
      const problems = validateCatalogFiles(parsed);
      for (const p of problems)
        process.stdout.write(`${p.taskId}: ${p.message}\n`);
      if (problems.length > 0) {
        process.exitCode = 1;
        return;
      }
      process.stdout.write(
        `ok: ${parsed.tasks.length} tasks, pin ${parsed.pin}\n`,
      );
    });
}
