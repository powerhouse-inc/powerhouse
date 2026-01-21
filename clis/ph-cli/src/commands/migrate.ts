import { migrateArgs } from "@powerhousedao/common/cli-args";
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
  },
});
