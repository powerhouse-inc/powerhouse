import {
  REACTOR_SCHEMA,
  type InProcessReactorModule,
} from "@powerhousedao/reactor";
import type { ISigner } from "@powerhousedao/shared/document-model";
import type { DeploymentSecret } from "../subject-hash.js";
import { ErasureService } from "./erasure-service.js";
import type { ErasureDb } from "./ledger.js";
import {
  ErasureScheduler,
  type ErasureLogger,
  type IDocumentPermissionEraser,
} from "./scheduler.js";

export type ModuleErasureOptions = {
  deploymentSecret: DeploymentSecret;
  /** The signer the reactor was built with; the scheduler refuses without one. */
  signer: ISigner | undefined;
  permissions?: IDocumentPermissionEraser;
  /** The executor's maxPurgeOperations, when the host overrides the default. */
  maxPurgeOperations?: number;
  deadlineMs?: number;
  intervalMs?: number;
  markerGraceMs?: number;
  now?: () => Date;
  logger?: ErasureLogger;
};

/** The service and scheduler over one reactor module; start the scheduler. */
export function createModuleErasure(
  reactorModule: InProcessReactorModule,
  options: ModuleErasureOptions,
): { service: ErasureService; scheduler: ErasureScheduler } {
  const db = reactorModule.database.withSchema(
    REACTOR_SCHEMA,
  ) as unknown as ErasureDb;
  const scheduler = new ErasureScheduler({
    db,
    deploymentSecret: options.deploymentSecret,
    signer: options.signer,
    purges: reactorModule.documentPurgeService,
    jobs: reactorModule.jobTracker,
    eventBus: reactorModule.eventBus,
    syncManager: reactorModule.syncModule?.syncManager,
    permissions: options.permissions,
    intervalMs: options.intervalMs,
    markerGraceMs: options.markerGraceMs,
    now: options.now,
    logger: options.logger,
  });
  const service = new ErasureService({
    db,
    deploymentSecret: options.deploymentSecret,
    maxPurgeOperations: options.maxPurgeOperations,
    deadlineMs: options.deadlineMs,
    now: options.now,
  });
  return { service, scheduler };
}
