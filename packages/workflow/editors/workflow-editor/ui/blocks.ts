// Palette presets; pure data used by the UI to seed new triggers and steps.

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
    label: "Document event",
    blockType: "core#document-event",
    description: "Fires when a matching document operation lands.",
    defaultConfig: {},
  },
  {
    label: "Document created",
    blockType: "core#document-created",
    description: "Fires when a document is added to a drive.",
    defaultConfig: {},
  },
  {
    label: "Document deleted",
    blockType: "core#document-deleted",
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
    label: "Create document",
    blockType: "core#document-create",
    description: "Creates a Powerhouse document.",
    defaultConfig: { documentType: "", name: "" },
  },
  {
    label: "Dispatch actions",
    blockType: "core#document-dispatch",
    description: "Sends actions to a document.",
    defaultConfig: { documentId: "", actions: [] },
  },
  {
    label: "Get document",
    blockType: "core#document-get",
    description: "Reads a document's current state.",
    defaultConfig: { documentId: "" },
  },
  {
    label: "Find documents",
    blockType: "core#document-find",
    description: "Lists documents by type and name.",
    defaultConfig: { documentType: "" },
  },
  {
    label: "Get document schema",
    blockType: "core#document-schema",
    description: "Action and state schemas of a document type.",
    defaultConfig: { documentType: "" },
  },
];
