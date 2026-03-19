import { migrateArgs } from "@powerhousedao/shared/clis";
import { command } from "cmd-ts";

export const migrate = command({
  name: "migrate",
  args: migrateArgs,
  description: "Run migrations",
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { startMigrate } = await import("../services/migrate.js");
    await startMigrate(args);
    process.exit(0);
  },
});
