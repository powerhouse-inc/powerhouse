import type { Command } from "commander";
import type { CommandActionType } from "../types.js";

export const migrate: CommandActionType<
  [string | string[] | undefined, { useHygen?: boolean; debug?: boolean }]
> = async (_, options) => {
  const { startMigrate } = await import("../services/migrate.js");
  return await startMigrate({
    useHygen: !!options.useHygen,
    debug: !!options.debug,
  });
};

export function migrateCommand(program: Command) {
  program
    .command("migrate")
    .description("Run migrations")
    .option("--ts-morph", "Use new ts-morph codegen")
    .action(migrate);
}
