// Builds the part of a step's RunScope that a reactor connection decides; the
// caller adds `deadline` and `journal`.
import {
  isReactorConnectorId,
  parseReactorConnectionConfig,
  type ConnectionDocument,
} from "@powerhousedao/workflow/document-models/connection";
import type { WorkflowRuntimeHostDeps } from "./host.js";
import { authEnforced, NO_RUN_USER_DENIAL } from "./reactor-access.js";
import { accessDenied } from "./reactor-errors.js";
import type { RunScope, RunUser } from "./run-scope.js";

export type ReactorRunScopeBase = Pick<
  RunScope,
  "runUser" | "requireReactor" | "connection"
>;

export interface ReactorRunScopeRequest {
  // The step's or trigger's reactorConnectionId, from the pinned snapshot.
  reactorConnectionId: string | null | undefined;
  requireReactor: "read" | "write";
  // From the run's pre-run check: null for an unsigned publish.
  runUser: RunUser | null;
}

// Throws ReactorAccessDeniedError when the step cannot have reactor access.
export async function buildReactorRunScope(
  host: Pick<WorkflowRuntimeHostDeps, "reactorClient" | "authEnforcement">,
  request: ReactorRunScopeRequest,
): Promise<ReactorRunScopeBase> {
  const { reactorConnectionId, requireReactor, runUser } = request;
  if (!reactorConnectionId) {
    throw accessDenied(
      "This step needs reactor access; bind a reactor connection",
    );
  }
  if (!runUser && authEnforced(host)) {
    throw accessDenied(NO_RUN_USER_DENIAL);
  }
  let document: ConnectionDocument;
  try {
    document =
      await host.reactorClient.get<ConnectionDocument>(reactorConnectionId);
  } catch {
    throw accessDenied(
      `Reactor connection "${reactorConnectionId}" was not found`,
    );
  }
  const state = document.state.global;
  if (
    document.header.documentType !== "powerhouse/connection" ||
    state.authType !== "REACTOR" ||
    !isReactorConnectorId(state.connectorId)
  ) {
    throw accessDenied(
      `Connection "${reactorConnectionId}" is not a reactor connection`,
    );
  }
  if (state.status === "REVOKED") {
    throw accessDenied(
      `Reactor connection "${reactorConnectionId}" is revoked`,
    );
  }
  const parsed = parseReactorConnectionConfig(state.config);
  if (!parsed.ok) {
    throw accessDenied(
      `Reactor connection "${reactorConnectionId}" is invalid: ${parsed.error}`,
    );
  }
  return {
    runUser,
    requireReactor,
    connection: { access: parsed.config.access ?? "write" },
  };
}
