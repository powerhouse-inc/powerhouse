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
    const models = args.documentModels || args.documentModel.length > 0;
    const subgraphs = args.subgraphs || args.subgraph.length > 0;
    if (args.strictResolvers && !subgraphs) {
      console.error(
        "--strict-resolvers applies only with --subgraphs or --subgraph.",
      );
      process.exit(1);
    }
    if (args.renameConflictingTypes && !models) {
      console.error(
        "--rename-conflicting-types applies only with --document-models or --document-model.",
      );
      process.exit(1);
    }
    if (models || subgraphs) {
      if (args.versionPositional ?? args.version ?? args.force) {
        console.error(
          "--document-models, --document-model, --subgraphs and --subgraph convert to code-first only; they take no version and no --force.",
        );
        process.exit(1);
      }
      let code = 0;
      if (models) {
        const { migrateDocumentModels } =
          await import("../services/migrate-document-models.js");
        code |= await migrateDocumentModels({
          projectDir: process.cwd(),
          dirs: args.documentModel,
          dryRun: Boolean(args.dryRun),
          renameConflictingTypes: Boolean(args.renameConflictingTypes),
        });
      }
      if (subgraphs) {
        const { migrateSubgraphs } =
          await import("../services/migrate-subgraphs.js");
        code |= await migrateSubgraphs({
          projectDir: process.cwd(),
          dirs: args.subgraph,
          dryRun: Boolean(args.dryRun),
          strictResolvers: Boolean(args.strictResolvers),
        });
      }
      process.exit(code);
    }
    const { startMigrate } = await import("../services/migrate.js");
    await startMigrate(args);
    process.exit(0);
  },
});
