// The run user: the signer of the latest publish. Runs execute the published
// snapshot, so the publisher vouches for what runs (ADR 0005 §6).
import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  ActionSigner,
  Operation,
} from "@powerhousedao/shared/document-model";
import type { HostIdentity } from "./host.js";
import type { RunUser } from "./run-scope.js";

export const PUBLISH_WORKFLOW = "PUBLISH_WORKFLOW";

// The subject derives as the reactor's own (authSubjectFromSigner). A signer
// with no address or no signature is an unsigned publish.
export function runUserOfOperation(
  operation: Pick<Operation, "action">,
  hostIdentity?: HostIdentity,
): RunUser | null {
  // Partial: a signer-less client leaves user and app unset.
  const signer = operation.action.context?.signer as
    | Partial<ActionSigner>
    | undefined;
  const address = signer?.user?.address;
  if (!signer || !address || !signer.signatures?.length) return null;
  const key = signer.app?.key;
  // The host signs what a caller sent unsigned, which vouches for nobody.
  if (hostIdentity && key === hostIdentity.key) return null;
  return { address, subject: { address, key } };
}

// The latest publish that applied; null when it was unsigned, host-signed or
// there is none.
export async function publishRunUser(
  client: Pick<IReactorClient, "getOperations">,
  workflowId: string,
  hostIdentity?: HostIdentity,
  signal?: AbortSignal,
): Promise<RunUser | null> {
  let page = await client.getOperations(
    workflowId,
    { scopes: ["global"] },
    { actionTypes: [PUBLISH_WORKFLOW] },
    undefined,
    signal,
  );
  let latest: Operation | undefined;
  for (;;) {
    for (const operation of page.results) {
      if (operation.action.type !== PUBLISH_WORKFLOW) continue;
      if (operation.error !== undefined) continue;
      if (!latest || operation.index > latest.index) latest = operation;
    }
    if (!page.next || page.results.length === 0) break;
    page = await page.next();
  }
  return latest ? runUserOfOperation(latest, hostIdentity) : null;
}
