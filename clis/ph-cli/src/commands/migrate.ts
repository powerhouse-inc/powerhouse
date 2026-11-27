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
    /**
     * The identity step, or undefined outside a Powerhouse project (unless
     * PH_USER_DATA_DIR names the data folder): it never acts on the current
     * folder's files for want of a project.
     */
    const identityStep = async (): Promise<number | undefined> => {
      const [
        { findNodeProjectRoot, isPowerhouseProject },
        { migrateIdentity },
        { LEGACY_RENOWN_URL },
      ] = await Promise.all([
        import("../utils.js"),
        import("../services/migrate-identity.js"),
        import("@powerhousedao/shared/clis/constants"),
      ]);
      const projectDir =
        findNodeProjectRoot(process.cwd(), isPowerhouseProject) ?? undefined;
      if (projectDir === undefined && !process.env.PH_USER_DATA_DIR) {
        return undefined;
      }
      const code = await migrateIdentity({
        ...(projectDir ? { projectDir } : {}),
        dryRun: Boolean(args.dryRun),
        renownUrl: args.renownUrl ?? LEGACY_RENOWN_URL,
        ...(args.renownUrl ? { renownUrlFrom: "--renown-url" } : {}),
      });
      process.env[IDENTITY_STEP_DONE_ENV] = "1";
      return code;
    };
    const NOT_IN_PROJECT =
      "not in a Powerhouse project (no powerhouse.config.json beside a package.json here or above)";
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
      const code = await identityStep();
      if (code === undefined) {
        console.error(
          `ph migrate --identity: ${NOT_IN_PROJECT}. Run it in the project, or set PH_USER_DATA_DIR to the data folder it acts on.`,
        );
        process.exit(1);
      }
      process.exit(code);
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
    // The version is checked first, so a mistyped one stops the command
    // before the identity step withdraws anything. Then the identity step; a
    // withdraw it could not make fails the command at the end, after the
    // version migration ran.
    const { resolveMigrateTarget, startMigrate } =
      await import("../services/migrate.js");
    const target = await resolveMigrateTarget(args);
    let identityCode = 0;
    if (process.env[IDENTITY_STEP_DONE_ENV] !== "1") {
      const code = await identityStep();
      if (code === undefined) {
        console.log(`Identity step: skipped, ${NOT_IN_PROJECT}.`);
      } else {
        identityCode = code;
      }
    }
    await startMigrate(args, target);
    process.exit(identityCode);
  },
});
