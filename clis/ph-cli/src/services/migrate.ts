import { migrate } from "@powerhousedao/codegen";
import type { MigrateArgs } from "../types.js";

export async function startMigrate(args: MigrateArgs) {
  const { version, debug } = args;
  if (debug) {
    console.log({ args });
  }
  await migrate(version);
}
