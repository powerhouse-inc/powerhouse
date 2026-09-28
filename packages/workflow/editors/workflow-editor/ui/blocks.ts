// Block helpers and palette presets; pure data used by the UI to seed new
// triggers and steps.
import {
  blockKey,
  type BlockIdentity,
  type BlockKind,
  type BlockRef,
} from "@powerhousedao/pieces-framework/block-type";
import { CORE_PIECE_NAME } from "@powerhousedao/pieces-framework/workflow";

export type { BlockIdentity, BlockKind, BlockRef };

export const CORE_PIECE = CORE_PIECE_NAME;

// The reactor piece this package ships, named as pieces/index.ts declares it.
export const REACTOR_PIECE = "@powerhousedao/piece-reactor";

const core = (kind: BlockKind, name: string): BlockIdentity => ({
  pieceName: CORE_PIECE,
  kind,
  name,
});

export const MANUAL_TRIGGER = core("trigger", "manual");
export const SCHEDULE_TRIGGER = core("trigger", "schedule");
export const WEBHOOK_TRIGGER = core("trigger", "webhook");
export const BRANCH_BLOCK = core("action", "branch");
export const ASSERT_BLOCK = core("action", "assert");

// A block to add: pinned already, or pinned to the installed version on pick.
export type BlockPick = BlockIdentity & { pieceVersion?: string };

export function sameBlock(
  a: BlockIdentity | undefined | null,
  b: BlockIdentity | undefined | null,
): boolean {
  return Boolean(a && b && blockKey(a) === blockKey(b));
}

export function isCoreBlock(block: { pieceName: string }): boolean {
  return block.pieceName === CORE_PIECE;
}

// The document blocks live in the reactor piece, and are offered here too:
// they are what most workflows on a reactor are built from.
export function isReactorPieceBlock(block: { pieceName: string }): boolean {
  return block.pieceName === REACTOR_PIECE;
}

export function stepBlock(step: {
  pieceName: string;
  pieceVersion: string;
  actionName: string;
}): BlockRef {
  return {
    pieceName: step.pieceName,
    pieceVersion: step.pieceVersion,
    kind: "action",
    name: step.actionName,
  };
}

export function triggerBlock(trigger: {
  pieceName: string;
  pieceVersion: string;
  triggerName: string;
}): BlockRef {
  return {
    pieceName: trigger.pieceName,
    pieceVersion: trigger.pieceVersion,
    kind: "trigger",
    name: trigger.triggerName,
  };
}

// The fields a step or the trigger stores for a block.
export function stepFields(block: BlockRef) {
  return {
    pieceName: block.pieceName,
    pieceVersion: block.pieceVersion,
    actionName: block.name,
  };
}

export function triggerFields(block: BlockRef) {
  return {
    pieceName: block.pieceName,
    pieceVersion: block.pieceVersion,
    triggerName: block.name,
  };
}

// A pinned pick passes through; an unpinned one takes the installed version,
// and undefined means the piece isn't installed.
export function pinBlock(
  pick: BlockPick,
  installedVersion: (piece: string) => string | undefined,
): BlockRef | undefined {
  const pieceVersion = pick.pieceVersion ?? installedVersion(pick.pieceName);
  if (!pieceVersion) return undefined;
  return {
    pieceName: pick.pieceName,
    pieceVersion,
    kind: pick.kind,
    name: pick.name,
  };
}

export interface BlockPreset {
  label: string;
  block: BlockPick;
  description: string;
  defaultConfig: unknown;
  // Which section of the picker it belongs to: "core" is the core piece,
  // "powerhouse" the reactor piece, listed right after it.

  // Optional because a pick built from a search hit or an existing step is
  // the same shape but belongs to no section.
  group?: "core" | "powerhouse";
}

const reactor = (kind: BlockKind, name: string): BlockIdentity => ({
  pieceName: REACTOR_PIECE,
  kind,
  name,
});

export const TRIGGER_PRESETS: BlockPreset[] = [
  {
    label: "Manual",
    block: MANUAL_TRIGGER,
    group: "core",
    description: "Fired on demand with a payload.",
    defaultConfig: {},
  },
  {
    label: "Schedule",
    block: SCHEDULE_TRIGGER,
    group: "core",
    description: "Fires on a cron expression or fixed interval.",
    defaultConfig: { mode: "cron", cron: "0 9 * * 1-5", timezone: "UTC" },
  },
  {
    label: "Webhook",
    block: WEBHOOK_TRIGGER,
    group: "core",
    description: "Fires when a provider POSTs to this workflow's URL.",
    defaultConfig: { methods: "POST", scheme: "none", responseMode: "async" },
  },
  {
    label: "Document event",
    block: reactor("trigger", "document-event"),
    group: "powerhouse",
    description: "Fires when a matching document operation lands.",
    defaultConfig: {},
  },
  {
    label: "Document created",
    block: reactor("trigger", "document-created"),
    group: "powerhouse",
    description: "Fires when a document is added to a drive.",
    defaultConfig: {},
  },
  {
    label: "Document deleted",
    block: reactor("trigger", "document-deleted"),
    group: "powerhouse",
    description: "Fires when a document is removed from a drive.",
    defaultConfig: {},
  },
];

export const STEP_PRESETS: BlockPreset[] = [
  {
    label: "Branch",
    block: BRANCH_BLOCK,
    group: "core",
    description: "Routes true/false on a condition.",
    defaultConfig: {},
  },
  {
    label: "Assert",
    block: ASSERT_BLOCK,
    group: "core",
    description:
      "Fails the run when a value is blank, rejected or not allowed.",
    defaultConfig: { value: "", allowValues: [] },
  },
  {
    label: "Create document",
    block: reactor("action", "document-create"),
    group: "powerhouse",
    description: "Creates a Powerhouse document.",
    defaultConfig: { documentType: "", name: "" },
  },
  {
    label: "Dispatch actions",
    block: reactor("action", "document-dispatch"),
    group: "powerhouse",
    description: "Sends actions to a document.",
    defaultConfig: { documentId: "" },
  },
  {
    label: "Get document",
    block: reactor("action", "document-get"),
    group: "powerhouse",
    description: "Reads a document's current state.",
    defaultConfig: { documentId: "" },
  },
  {
    label: "Find documents",
    block: reactor("action", "document-find"),
    group: "powerhouse",
    description: "Lists documents by type and name.",
    defaultConfig: { documentType: "" },
  },
  {
    label: "List document types",
    block: reactor("action", "document-types"),
    group: "powerhouse",
    description: "Document models installed on this reactor.",
    defaultConfig: {},
  },
  {
    label: "Get document schema",
    block: reactor("action", "document-schema"),
    group: "powerhouse",
    description: "Action and state schemas of a document type.",
    defaultConfig: { documentType: "" },
  },
];

// A preset as the picker hands it over: pinned to a version.
export interface PickedPreset extends BlockPreset {
  block: BlockRef;
}
