// Composes the workflow runtime for a reactor that has workflows enabled. The
// engine is loaded lazily, so a host with the flag off never imports it.
import type { IReactorClient, IRelationalDb } from "@powerhousedao/reactor";
import type * as WorkflowEngine from "@powerhousedao/reactor-workflow";
import type {
  AttachmentClientLike,
  WorkflowCaller,
  WorkflowRuntimeHostDeps,
} from "@powerhousedao/reactor-workflow";
import type {
  IProcessorManager,
  IWebhookScope,
} from "@powerhousedao/shared/processors";
import type { ILogger } from "document-model";
import { ForbiddenError } from "../graphql/errors.js";
import type { Context, SubgraphClass } from "../graphql/types.js";
import { createWorkflowRuntimeSubgraph } from "../graphql/workflow/subgraph.js";
import {
  AuthorizationPolicy,
  type CanonicalDocumentId,
  type IAuthorizationService,
} from "../services/authorization.service.js";
import { createCanonicalDocumentIdResolver } from "../services/canonical-document-id.js";

type WorkflowEngineModule = typeof WorkflowEngine;

export interface ComposeWorkflowRuntimeDeps {
  reactorClient: IReactorClient;
  relationalDb: IRelationalDb;
  attachments: AttachmentClientLike;
  webhooks?: IWebhookScope;
  authorizationService: IAuthorizationService;
  processorManager: IProcessorManager;
  logger: ILogger;
  /** Overridden by the tests; production always loads the real engine. */
  load?: () => Promise<WorkflowEngineModule>;
}

export interface ComposedWorkflowRuntime {
  subgraph: SubgraphClass;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** The engine's own access check, answered exactly as BaseSubgraph answers it:
 * a supreme admin passes, any policy but document permissions fails closed, and
 * an unresolvable identifier is a denial rather than an existence oracle. */
function readAssertion(
  authorizationService: IAuthorizationService,
  reactorClient: IReactorClient,
): WorkflowRuntimeHostDeps["assertCanRead"] {
  const resolveCanonical = createCanonicalDocumentIdResolver(reactorClient);
  return async (identifier: string, caller: WorkflowCaller) => {
    const ctx = caller as Context;
    if (authorizationService.isSupremeAdmin(ctx.user?.address)) return;
    if (
      authorizationService.config.policy !==
      AuthorizationPolicy.DOCUMENT_PERMISSIONS
    ) {
      throw new ForbiddenError();
    }
    let documentId: CanonicalDocumentId;
    try {
      documentId = await resolveCanonical(identifier);
    } catch {
      throw new ForbiddenError();
    }
    const canRead = await authorizationService.canRead(
      documentId,
      ctx.user?.address,
    );
    if (!canRead) throw new ForbiddenError("to read this document");
  };
}

export async function composeWorkflowRuntime(
  deps: ComposeWorkflowRuntimeDeps,
): Promise<ComposedWorkflowRuntime> {
  const load = deps.load ?? (() => import("@powerhousedao/reactor-workflow"));

  let engine: WorkflowEngineModule;
  try {
    engine = await load();
  } catch (error) {
    throw new Error(
      "Workflows are enabled but @powerhousedao/reactor-workflow could not be loaded",
      { cause: error },
    );
  }

  const runtime = engine.createWorkflowRuntime({
    relationalDb: deps.relationalDb,
    reactorClient: deps.reactorClient,
    assertCanRead: readAssertion(deps.authorizationService, deps.reactorClient),
    webhooks: deps.webhooks,
    attachments: deps.attachments,
    logger: deps.logger,
  });

  return {
    subgraph: createWorkflowRuntimeSubgraph(runtime),

    async start() {
      // The endpoint family first: a restored webhook trigger asks for its URL
      // as soon as the supervisor starts.
      await runtime.registerWebhookEndpoint();
      await deps.processorManager.registerFactory(
        engine.WORKFLOW_PACKAGE_NAME,
        engine.createDocumentEventProcessorFactory(runtime, deps.relationalDb),
      );
      runtime.startTriggerSupervisor();
    },

    async stop() {
      await deps.processorManager.unregisterFactory(
        engine.WORKFLOW_PACKAGE_NAME,
      );
      runtime.shutdown();
    },
  };
}
