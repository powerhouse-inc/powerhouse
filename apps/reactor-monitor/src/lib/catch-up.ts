import type { CatchUpStatus } from "@powerhousedao/reactor";

/**
 * The status when it carries a head to measure progress against. A remote
 * serves catch-up status as a JSON scalar, so its watermark can be missing.
 */
export function withHead(
  status: CatchUpStatus | null | undefined,
): CatchUpStatus | undefined {
  const head: unknown = status?.watermark?.head;
  return typeof head === "number" && Number.isFinite(head)
    ? status!
    : undefined;
}
