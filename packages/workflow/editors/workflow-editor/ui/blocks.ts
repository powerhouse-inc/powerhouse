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
}

export const TRIGGER_PRESETS: BlockPreset[] = [
  {
    label: "Manual",
    blockType: "core#manual",
    description: "Fired on demand with a payload.",
    defaultConfig: {},
  },
  {
    label: "Schedule",
    blockType: "core#schedule",
    description: "Fires on a cron expression or fixed interval.",
    defaultConfig: { mode: "cron", cron: "0 9 * * 1-5", timezone: "UTC" },
  },
  {
    label: "Webhook",
    blockType: "core#webhook",
    description: "Fires when a provider POSTs to this workflow's URL.",
    defaultConfig: { methods: "POST", scheme: "none", responseMode: "async" },
  },
  {
    label: "Document event",
    blockType: `${REACTOR_PIECE}#trigger:document-event`,
    description: "Fires when a matching document operation lands.",
    defaultConfig: {},
  },
  {
    label: "Document created",
    blockType: `${REACTOR_PIECE}#trigger:document-created`,
    description: "Fires when a document is added to a drive.",
    defaultConfig: {},
  },
  {
    label: "Document deleted",
    blockType: `${REACTOR_PIECE}#trigger:document-deleted`,
    description: "Fires when a document is removed from a drive.",
    defaultConfig: {},
  },
];

export const STEP_PRESETS: BlockPreset[] = [
  {
    label: "Branch",
    blockType: "core#branch",
    description: "Routes true/false on a condition.",
    defaultConfig: { condition: "{{trigger.payload.ok}}" },
  },
  {
    label: "Assert",
    blockType: "core#assert",
    description:
      "Fails the run when a value is blank, rejected or not allowed.",
    defaultConfig: { value: "", allowValues: [] },
  },
  {
    label: "Create document",
    blockType: `${REACTOR_PIECE}#document-create`,
    description: "Creates a Powerhouse document.",
    defaultConfig: { documentType: "", name: "" },
  },
  {
    label: "Dispatch actions",
    blockType: `${REACTOR_PIECE}#document-dispatch`,
    description: "Sends actions to a document.",
    defaultConfig: { documentId: "", actions: [] },
  },
  {
    label: "Get document",
    blockType: `${REACTOR_PIECE}#document-get`,
    description: "Reads a document's current state.",
    defaultConfig: { documentId: "" },
  },
  {
    label: "Find documents",
    blockType: `${REACTOR_PIECE}#document-find`,
    description: "Lists documents by type and name.",
    defaultConfig: { documentType: "" },
  },
  {
    label: "List document types",
    blockType: `${REACTOR_PIECE}#document-types`,
    description: "Document models installed on this reactor.",
    defaultConfig: {},
  },
  {
    label: "Get document schema",
    blockType: `${REACTOR_PIECE}#document-schema`,
    description: "Action and state schemas of a document type.",
    defaultConfig: { documentType: "" },
  },
];
