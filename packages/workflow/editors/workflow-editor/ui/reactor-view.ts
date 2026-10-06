// What the editor says about reactor access: who runs act as, and the
// published snapshot's missing connections.

export function shortAddress(address: string): string {
  return address.length <= 12
    ? address
    : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export interface PublishOperation {
  index: number;
  error?: string | null;
  action: {
    type: string;
    context?: {
      signer?: {
        user?: { address?: string | null } | null;
        signatures?: readonly unknown[] | null;
      } | null;
    } | null;
  };
}

// The signer of the latest applied publish; null when it was unsigned,
// undefined when there was none.
export function publisherOf(
  operations: readonly PublishOperation[],
): string | null | undefined {
  let latest: PublishOperation | undefined;
  for (const operation of operations) {
    if (operation.action.type !== "PUBLISH_WORKFLOW") continue;
    if (operation.error) continue;
    if (!latest || operation.index > latest.index) latest = operation;
  }
  if (!latest) return undefined;
  const signer = latest.action.context?.signer;
  const address = signer?.user?.address;
  return address && signer.signatures?.length ? address : null;
}

// Who a run reaches documents as; null while not known.
export function runsAsText(
  publisher: string | null | undefined,
  loading: boolean,
  hostAddress?: string | null,
): string | null {
  if (loading) return null;
  if (
    publisher &&
    hostAddress &&
    publisher.toLowerCase() === hostAddress.toLowerCase()
  ) {
    return "Published by the Switchboard: runs get no reactor access while document permissions are enforced.";
  }
  if (publisher === undefined) {
    return "Not published yet: runs will act as whoever publishes.";
  }
  if (publisher === null) {
    return "Published unsigned: runs get no reactor access while document permissions are enforced.";
  }
  return `Runs as ${shortAddress(publisher)} (last publisher)`;
}

export interface PublishedBlock {
  label: string;
  reactorConnectionId?: string | null;
  requireReactor: "read" | "write" | null | undefined;
}

// Published blocks that declare reactor access but bind no connection.
export function missingInPublished(
  blocks: readonly PublishedBlock[],
): string[] {
  return blocks
    .filter((block) => block.requireReactor && !block.reactorConnectionId)
    .map((block) => block.label);
}
