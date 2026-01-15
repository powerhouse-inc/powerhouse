import { boolean, command, flag, optional } from "cmd-ts";
import { startMigrate } from "../services/migrate.js";
import { debugArgs } from "./common-args.js";

export const migrateDescription = "Run migrations";

export const migrateArgs = {
  useHygen: flag({
    type: optional(boolean),
    long: "use-hygen",
  }),
  ...debugArgs,
};

export const migrate = command({
  name: "migrate",
  args: migrateArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    await startMigrate(args);
    return args;
  },
});
