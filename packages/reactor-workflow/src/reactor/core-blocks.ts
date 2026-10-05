// The core piece's blocks the host serves itself, as keys to compare a block's
// blockKey with. The piece declares them; schedule.ts and webhook.ts feed them.
import {
  blockKey,
  type BlockIdentity,
  type BlockRef,
} from "@powerhousedao/pieces-framework/block-type";
import { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "../pieces/index.js";

const trigger = (name: string) =>
  blockKey({ pieceName: CORE_PIECE_NAME, kind: "trigger", name });

const action = (name: string) =>
  blockKey({ pieceName: CORE_PIECE_NAME, kind: "action", name });

export const MANUAL_BLOCK = trigger("manual");
export const SCHEDULE_BLOCK = trigger("schedule");
export const WEBHOOK_BLOCK = trigger("webhook");
export const BRANCH_BLOCK = action("branch");
export const ASSERT_BLOCK = action("assert");

export function isCoreBlock(block: BlockIdentity): boolean {
  return block.pieceName === CORE_PIECE_NAME;
}

// A core trigger pinned to the installed core piece.
export function coreTrigger(name: string): BlockRef {
  return {
    pieceName: CORE_PIECE_NAME,
    pieceVersion: CORE_PIECE_VERSION,
    kind: "trigger",
    name,
  };
}
