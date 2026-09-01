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
    label: "Document event",
    blockType: "core#document-event",
    description: "Fires when a matching document operation lands.",
    defaultConfig: { documentType: "", actionType: "" },
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
    label: "HTTP request",
    blockType: "@activepieces/piece-http@0.11.19#send_request",
    description: "Calls an HTTP endpoint.",
    defaultConfig: {
      method: "GET",
      url: "",
      headers: {},
      queryParams: {},
      authType: "NONE",
      timeout: 30,
      failureMode: "continue_none",
    },
  },
  {
    label: "Gotify notification",
    blockType: "@activepieces/piece-gotify@0.4.6#send_notification",
    description: "Sends a Gotify notification (needs a connection).",
    defaultConfig: { title: "", message: "" },
  },
];
