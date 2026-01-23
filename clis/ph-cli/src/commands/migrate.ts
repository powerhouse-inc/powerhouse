import { migrateArgs } from "@powerhousedao/common/clis";
import { command } from "cmd-ts";
import { startMigrate } from "../services/migrate.js";

export const migrate = command({
  name: "migrate",
  args: migrateArgs,
  description: "Run migrations",
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    await startMigrate(args);
    process.exit(0);
  },
});
