import { migrateArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const migrate = command({
  name: "migrate",
  args: migrateArgs,
  description: "Run migrations",
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    if (args.subgraphs || args.subgraph.length > 0) {
      if (args.versionPositional ?? args.version ?? args.force) {
        console.error(
          "--subgraphs and --subgraph convert subgraphs only; they take no version and no --force.",
        );
        process.exit(1);
      }
      const { migrateSubgraphs } =
        await import("../services/migrate-subgraphs.js");
      process.exit(
        await migrateSubgraphs({
          projectDir: process.cwd(),
          dirs: args.subgraph,
          dryRun: Boolean(args.dryRun),
        }),
      );
    }
    if (args.dryRun) {
      console.error("--dry-run applies only with --subgraphs or --subgraph.");
      process.exit(1);
    }
    const { startMigrate } = await import("../services/migrate.js");
    await startMigrate(args);
    process.exit(0);
  },
});
