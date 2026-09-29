import {
  ConsistencyTracker,
  REACTOR_SCHEMA,
  supportsLiveReadModelRegistration,
  type DocumentViewDatabase,
  type InProcessReactorModule,
} from "@powerhousedao/reactor";
import type { Kysely } from "kysely";
import { runReactorPrivacyMigrations } from "../schema/migrations/migrator.js";
import type { DeploymentSecret } from "../subject-hash.js";
import { SubjectDocumentsReadModel } from "./subject-documents-read-model.js";

export class LiveReadModelRegistrationError extends Error {
  constructor() {
    super(
      "The reactor's read model coordinator cannot add a read model after build",
    );
    this.name = "LiveReadModelRegistrationError";
  }
}

/** Post-build registration on the host thread, as switchboard's add-ons do. */
export async function registerSubjectDocumentsReadModel(
  reactorModule: InProcessReactorModule,
  options: { deploymentSecret: DeploymentSecret },
): Promise<SubjectDocumentsReadModel> {
  const coordinator = reactorModule.readModelCoordinator;
  if (!supportsLiveReadModelRegistration(coordinator)) {
    throw new LiveReadModelRegistrationError();
  }

  const base = reactorModule.database as unknown as Kysely<unknown>;
  const migrated = await runReactorPrivacyMigrations(base, REACTOR_SCHEMA);
  if (!migrated.success) {
    throw migrated.error ?? new Error("reactor-privacy migrations failed");
  }

  const readModel = new SubjectDocumentsReadModel(
    base.withSchema(REACTOR_SCHEMA) as unknown as Kysely<DocumentViewDatabase>,
    reactorModule.operationIndex,
    reactorModule.writeCache,
    new ConsistencyTracker(),
    options.deploymentSecret,
  );

  // The second init replays what committed between the first and the add.
  await readModel.init();
  coordinator.addReadModel(readModel, "pre_ready");
  await readModel.init();
  return readModel;
}
