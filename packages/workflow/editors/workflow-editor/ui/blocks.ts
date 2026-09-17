// Palette presets; pure data used by the UI to seed new triggers and steps.

// The document blocks live in the reactor piece, and are offered here too:
// they are what most workflows on a reactor are built from, and a picker that
// made an author search for them would be a worse picker.
import { REACTOR_PIECE } from "./reactor-piece-form.js";

export interface BlockPreset {
  label: string;
  blockType: string;
  description: string;
  defaultConfig: unknown;
  // Which section of the picker it belongs to: "core" is the engine's own,
  // "powerhouse" the reactor piece, listed right after it.

  // Optional because a pick built from a search hit or an existing step is
  // the same shape but belongs to no section.
  group?: "core" | "powerhouse";
}

export const TRIGGER_PRESETS: BlockPreset[] = [
  {
    label: "Manual",
    blockType: "core#manual",
    group: "core",
    description: "Fired on demand with a payload.",
    defaultConfig: {},
  },
  {
    label: "Schedule",
    blockType: "core#schedule",
    group: "core",
    description: "Fires on a cron expression or fixed interval.",
    defaultConfig: { mode: "cron", cron: "0 9 * * 1-5", timezone: "UTC" },
  },
  {
    label: "Webhook",
    blockType: "core#webhook",
    group: "core",
    description: "Fires when a provider POSTs to this workflow's URL.",
    defaultConfig: { methods: "POST", scheme: "none", responseMode: "async" },
  },
  {
    label: "Document event",
    blockType: `${REACTOR_PIECE}#trigger:document-event`,
    group: "powerhouse",
    description: "Fires when a matching document operation lands.",
    defaultConfig: {},
  },
  {
    label: "Document created",
    blockType: `${REACTOR_PIECE}#trigger:document-created`,
    group: "powerhouse",
    description: "Fires when a document is added to a drive.",
    defaultConfig: {},
  },
  {
    label: "Document deleted",
    blockType: `${REACTOR_PIECE}#trigger:document-deleted`,
    group: "powerhouse",
    description: "Fires when a document is removed from a drive.",
    defaultConfig: {},
  },
];

export const STEP_PRESETS: BlockPreset[] = [
  {
    label: "Branch",
    blockType: "core#branch",
    group: "core",
    description: "Routes true/false on a condition.",
    defaultConfig: { condition: "{{trigger.payload.ok}}" },
  },
  {
    label: "Assert",
    blockType: "core#assert",
    group: "core",
    description:
      "Fails the run when a value is blank, rejected or not allowed.",
    defaultConfig: { value: "", allowValues: [] },
  },
  {
    label: "Create document",
    blockType: `${REACTOR_PIECE}#document-create`,
    group: "powerhouse",
    description: "Creates a Powerhouse document.",
    defaultConfig: { documentType: "", name: "" },
  },
  {
    label: "Dispatch actions",
    blockType: `${REACTOR_PIECE}#document-dispatch`,
    group: "powerhouse",
    description: "Sends actions to a document.",
    defaultConfig: { documentId: "", actions: [] },
  },
  {
    label: "Get document",
    blockType: `${REACTOR_PIECE}#document-get`,
    group: "powerhouse",
    description: "Reads a document's current state.",
    defaultConfig: { documentId: "" },
  },
  {
    label: "Find documents",
    blockType: `${REACTOR_PIECE}#document-find`,
    group: "powerhouse",
    description: "Lists documents by type and name.",
    defaultConfig: { documentType: "" },
  },
  {
    label: "List document types",
    blockType: `${REACTOR_PIECE}#document-types`,
    group: "powerhouse",
    description: "Document models installed on this reactor.",
    defaultConfig: {},
  },
  {
    label: "Get document schema",
    blockType: `${REACTOR_PIECE}#document-schema`,
    group: "powerhouse",
    description: "Action and state schemas of a document type.",
    defaultConfig: { documentType: "" },
  },
];
