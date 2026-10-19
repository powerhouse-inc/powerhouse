// The read check on a snapshot's reactor connections (ADR 0005 §6), run on
// publish, on enable and before each run.
import type { WorkflowRuntimeHostDeps } from "./host.js";
import { accessDenied } from "./reactor-errors.js";
import type { RunUser } from "./run-scope.js";
import { publishRunUser } from "./run-user.js";

// Absent counts as on: a host that doesn't say gets the strict checks.
export function authEnforced(
  host: Pick<WorkflowRuntimeHostDeps, "authEnforcement">,
): boolean {
  return host.authEnforcement !== false;
}

export const NO_RUN_USER_DENIAL =
  "The workflow was published unsigned or by the Switchboard itself, so it gets no reactor access while auth enforcement is on; publish it signed in";

// The reactor's read gate, as the run user, on a reactor connection.
export async function assertConnectionReadable(
  host: Pick<WorkflowRuntimeHostDeps, "reactorClient">,
  connectionId: string,
  runUser: RunUser,
): Promise<void> {
  const served = await host.reactorClient
    .isServed(connectionId, { subject: runUser.subject })
    .catch(() => false);
  if (!served) {
    throw accessDenied(
      `${runUser.address} cannot read reactor connection "${connectionId}"`,
    );
  }
}

// Resolves the run user, and throws ReactorAccessDeniedError when it may not
// read a bound connection. Binding none needs no run user, so none is read.
export async function assertReactorConnectionsReadable(
  host: Pick<
    WorkflowRuntimeHostDeps,
    "reactorClient" | "authEnforcement" | "hostIdentity"
  >,
  workflowId: string,
  connectionIds: ReadonlySet<string>,
  // Known already, as when the publish operation is at hand.
  known?: RunUser | null,
): Promise<RunUser | null | undefined> {
  if (connectionIds.size === 0) return undefined;
  const runUser =
    known !== undefined
      ? known
      : await publishRunUser(host.reactorClient, workflowId, host.hostIdentity);
  if (!runUser) {
    if (authEnforced(host)) throw accessDenied(NO_RUN_USER_DENIAL);
    return null;
  }
  for (const connectionId of connectionIds) {
    await assertConnectionReadable(host, connectionId, runUser);
  }
  return runUser;
}
