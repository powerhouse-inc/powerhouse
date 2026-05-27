import { switchboardArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const switchboard = command({
  name: "switchboard",
  aliases: ["reactor"],
  description: `
The switchboard command starts a local Switchboard instance, which acts as the document
processing engine for Powerhouse projects. It provides the infrastructure for document
models, processors, and real-time updates.

This command:
1. Starts a local switchboard server
2. Loads document models and processors
3. Provides an API for document operations
4. Enables real-time document processing
5. Can authenticate with remote services using your identity from 'ph login'`,
  args: switchboardArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { basePath, dbPath, migrate, migrateStatus, reset, yes } = args;
    if (basePath) {
      process.env.BASE_PATH = basePath;
    }

    if (reset) {
      const { resetSwitchboardDatabase } =
        await import("../services/switchboard-reset.js");
      await resetSwitchboardDatabase({ dbPath, yes });
      process.exit(0);
    }

    if (migrate || migrateStatus) {
      const { runSwitchboardMigrations } =
        await import("../services/switchboard-migrate.js");
      await runSwitchboardMigrations({
        dbPath,
        statusOnly: migrateStatus,
      });
      process.exit(0);
    }

    const { startSwitchboard } = await import("../services/switchboard.js");
    const { defaultDriveUrl, renown } = await startSwitchboard(args);
    console.log("   ➜  Switchboard:", defaultDriveUrl);
    if (renown) {
      console.log("   ➜  Identity:", renown.did);
    }
  },
});
