// Where a block's last test stands, the way Activepieces reads it: a test
// taken before the block's last edit no longer says anything about it.
import { isCoreBlock, type BlockIdentity } from "./blocks.js";
import type { BlockStateModel } from "./model.js";

export type TestState = "never" | "stale" | "failed" | "passed";

export function testState(
  block: BlockStateModel,
  // The test run's status, once known.
  runStatus?: string | null,
): TestState {
  const test = block.lastTest;
  if (!test) return "never";
  if (
    block.updatedAt &&
    Date.parse(block.updatedAt) > Date.parse(test.testedAt)
  )
    return "stale";
  return runStatus === "FAILED" ? "failed" : "passed";
}

// Piece triggers are the ones the runtime can test through a hook.
export function isTestableTrigger(block: BlockIdentity): boolean {
  return block.kind === "trigger" && !isCoreBlock(block);
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}
