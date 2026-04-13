import { migrate } from "@powerhousedao/codegen";
import type { MigrateArgs } from "../types.js";

export async function startMigrate(args: MigrateArgs) {
  if (args.debug) {
    console.log({ args });
  }
  await migrate(args);
}
