import type { InProcessReactorModule } from "@powerhousedao/reactor";
import {
  BareReadGate,
  ModelReadGate,
  readDecisionModel,
  SyncScopeGate,
} from "@powerhousedao/reactor";
import type { ILogger } from "document-model";
import type { AuthorizationConfig } from "./authorization.service.js";

/**
 * The gate sync serving evaluates a document's own policy through, deciding
 * what the reactor client's read gate decides at the same flag level.
 *
 * Under `authEnforcement` it is built here rather than taken off the client
 * because it also carries the host's closes-by-default setting, which withholds
 * the domain scopes of a document nobody has policied yet. That answer belongs
 * to serving alone -- replay must keep reading an uninitialized document in
 * full -- so the two gates are separate objects over the same model.
 *
 * Below it the registered model ignores the auth scope, so the client reads
 * through the policy alone, and so does serving: a policy written below the
 * flag still withholds, where serving ungated would sync to a peer what `get`
 * refuses it.
 */
export function buildSyncServingGate(
  reactorModule: InProcessReactorModule | undefined,
  authorizationConfig: AuthorizationConfig,
  logger: ILogger,
): SyncScopeGate | undefined {
  if (!reactorModule) {
    return undefined;
  }

  const model = readDecisionModel(
    reactorModule.featureFlags,
    reactorModule.documentModelRegistry,
  );
  if (!model) {
    return new SyncScopeGate(
      new BareReadGate(),
      reactorModule.documentView,
      logger,
    );
  }

  return new SyncScopeGate(
    new ModelReadGate(
      model,
      reactorModule.documentView,
      reactorModule.featureFlags.authGroups,
      reactorModule.operationIndex,
      logger,
      { withholdUninitialized: authorizationConfig.defaultProtection },
    ),
    reactorModule.documentView,
    logger,
  );
}
