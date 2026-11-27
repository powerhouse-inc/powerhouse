import { migrateArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

/**
 * Set on a `ph migrate` this one re-executes, once its identity step ran, so
 * the step runs once. A ph-cli before the step sets nothing, so the one it
 * re-executes runs it.
 */
const IDENTITY_STEP_DONE_ENV = "PH_MIGRATE_IDENTITY_DONE";

export const migrate = command({
  name: "migrate",
  args: migrateArgs,
  description:
    "Run migrations. `ph migrate` runs the identity step first (what a project kept of identities before Powerhouse 6.4; `--identity` runs it alone), then moves the project to a version.",
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
    const identityStep = async () => {
      const [
        { findNodeProjectRoot, isPowerhouseProject },
        { migrateIdentity },
      ] = await Promise.all([
        import("../utils.js"),
        import("../services/migrate-identity.js"),
      ]);
      const projectDir =
        findNodeProjectRoot(process.cwd(), isPowerhouseProject) ??
        process.cwd();
      const code = await migrateIdentity({
        projectDir,
        dryRun: Boolean(args.dryRun),
        renownUrl: args.renownUrl,
      });
      process.env[IDENTITY_STEP_DONE_ENV] = "1";
      return code;
    };
    if (args.identity) {
      if (
        models ||
        subgraphs ||
        args.versionPositional ||
        args.version ||
        args.force
      ) {
        console.error(
          "--identity runs the identity step alone: it takes no version, no --force and no other step.",
        );
        process.exit(1);
      }
      process.exit(await identityStep());
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
    // The identity step first; a withdraw it could not make fails the
    // command at the end, after the version migration ran.
    const identityCode =
      process.env[IDENTITY_STEP_DONE_ENV] === "1" ? 0 : await identityStep();
    const { startMigrate } = await import("../services/migrate.js");
    await startMigrate(args);
    process.exit(identityCode);
  },
});
