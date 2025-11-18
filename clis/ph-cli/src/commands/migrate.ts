import type { Command } from "commander";

async function migrate() {
  const { migrate } = await import("../services/migrate/migrate.js");
  return await migrate();
}

export function migrateCommand(program: Command) {
  program.command("migrate").description("Run migrations").action(migrate);
}
