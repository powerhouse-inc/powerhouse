// Form descriptors driving property panels; pure data, mirrors the
// ConnectorPropDescriptor shape from reactor-connectors.

export interface BlockFormProp {
  name: string;
  displayName: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  staticOptions?: { label: string; value: unknown }[];
  hasDynamicResolver?: boolean;
  description?: string;
}

export interface BlockForm {
  title: string;
  requireAuth: boolean;
  // Whether the block takes a connection: none hides the field entirely.
  auth?: "none" | "optional" | "required";
  props: BlockFormProp[];
}

export interface ConnectionSummary {
  id: string;
  name: string;
  connectorId: string;
  authType: string;
  status: string;
  accountLabel: string | null;
}

export interface DesignTimeService {
  getBlockForm: (blockType: string) => Promise<BlockForm | null>;
  loadOptions: (
    blockType: string,
    propName: string,
    input: Record<string, unknown>,
    connectionId?: string,
  ) => Promise<unknown>;
  // Runs the current workflow's piece trigger test hook; sample items back.
  testTrigger?: () => Promise<unknown>;
  // powerhouse/connection documents for the connection picker.
  listConnections?: () => Promise<ConnectionSummary[]>;
}

const text = (
  name: string,
  displayName: string,
  required = false,
  description?: string,
): BlockFormProp => ({
  name,
  displayName,
  type: "SHORT_TEXT",
  required,
  description,
});

// Reactor-backed autocomplete: options load from the runtime subgraph.
const autocomplete = (
  name: string,
  displayName: string,
  required = false,
  description?: string,
): BlockFormProp => ({
  name,
  displayName,
  type: "PH_AUTOCOMPLETE",
  required,
  description,
  hasDynamicResolver: true,
});

// Action list whose action types adapt to the target document type.
const documentActions = (
  displayName: string,
  required = false,
  description?: string,
): BlockFormProp => ({
  name: "actions",
  displayName,
  type: "PH_ACTIONS",
  required,
  description,
  hasDynamicResolver: true,
});

const number = (
  name: string,
  displayName: string,
  required = false,
  description?: string,
): BlockFormProp => ({
  name,
  displayName,
  type: "NUMBER",
  required,
  description,
});

const dropdown = (
  name: string,
  displayName: string,
  options: { label: string; value: unknown }[],
  required = false,
  description?: string,
): BlockFormProp => ({
  name,
  displayName,
  type: "STATIC_DROPDOWN",
  required,
  description,
  staticOptions: options,
});

// Hand-written forms for core blocks and triggers.
export const CORE_FORMS: Record<string, BlockForm> = {
  "core#manual": {
    title: "Manual trigger",
    requireAuth: false,
    auth: "none",
    props: [],
  },
  "core#schedule": {
    title: "Schedule",
    requireAuth: false,
    auth: "none",
    props: [
      dropdown(
        "mode",
        "Mode",
        [
          { label: "Cron expression", value: "cron" },
          { label: "Fixed interval", value: "interval" },
        ],
        true,
      ),
      text(
        "cron",
        "Cron expression",
        false,
        "Five fields, e.g. 0 9 * * 1-5 (09:00 on weekdays); cron mode only",
      ),
      number(
        "every",
        "Every",
        false,
        "Interval mode only; at least one minute",
      ),
      dropdown("unit", "Unit", [
        { label: "Minutes", value: "minutes" },
        { label: "Hours", value: "hours" },
        { label: "Days", value: "days" },
      ]),
      text(
        "timezone",
        "Timezone",
        false,
        "IANA name, e.g. Europe/Lisbon; defaults to UTC",
      ),
    ],
  },
  "core#document-event": {
    title: "Document event",
    requireAuth: false,
    auth: "none",
    props: [
      autocomplete(
        "documentType",
        "Document type",
        false,
        "e.g. powerhouse/connection",
      ),
      autocomplete(
        "documentId",
        "Document id",
        false,
        "Omit to match any document",
      ),
      autocomplete(
        "actionType",
        "Action type",
        false,
        "Omit to match any action",
      ),
    ],
  },
  "core#document-created": {
    title: "Document created",
    requireAuth: false,
    auth: "none",
    props: [
      autocomplete(
        "documentType",
        "Document type",
        false,
        "Type of the created document; omit to match any",
      ),
      autocomplete("driveId", "Drive", false, "Omit to match every drive"),
    ],
  },
  "core#document-deleted": {
    title: "Document deleted",
    requireAuth: false,
    auth: "none",
    props: [
      autocomplete(
        "documentType",
        "Document type",
        false,
        "Resolved best-effort after deletion; omit to match any",
      ),
      autocomplete("driveId", "Drive", false, "Omit to match every drive"),
    ],
  },
  "core#branch": {
    title: "Branch",
    requireAuth: false,
    auth: "none",
    props: [
      text(
        "condition",
        "Condition",
        true,
        "e.g. {{steps.fetch.output.body.ok}}",
      ),
    ],
  },
  "core#document-create": {
    title: "Create document",
    requireAuth: false,
    auth: "none",
    props: [
      autocomplete("documentType", "Document type", true),
      text("name", "Document name"),
      text("parentId", "Parent drive/folder id"),
      documentActions("Initial actions"),
    ],
  },
  "core#document-dispatch": {
    title: "Dispatch actions",
    requireAuth: false,
    auth: "none",
    props: [
      autocomplete(
        "documentId",
        "Document id",
        true,
        "e.g. {{steps.create.output.documentId}}",
      ),
      autocomplete(
        "documentType",
        "Document type",
        false,
        "Design-time hint when the document id is an expression",
      ),
      documentActions("Actions", true),
      text(
        "allowedActions",
        "Allowed action types",
        false,
        "Comma-separated whitelist; enforced when set",
      ),
    ],
  },
  "core#document-get": {
    title: "Get document",
    requireAuth: false,
    auth: "none",
    props: [
      autocomplete(
        "documentId",
        "Document id",
        true,
        "e.g. {{steps.find.output.documents.0.documentId}}",
      ),
      autocomplete(
        "documentType",
        "Document type",
        false,
        "Design-time hint when the document id is an expression",
      ),
    ],
  },
  "core#document-find": {
    title: "Find documents",
    requireAuth: false,
    auth: "none",
    props: [
      autocomplete("documentType", "Document type", false, "Omit for any type"),
      autocomplete("parentId", "In drive/folder", false, "Omit for the whole reactor"),
      text("name", "Name contains", false, "Case-insensitive match"),
      text("limit", "Max results", false, "Defaults to 25"),
    ],
  },
  "core#document-schema": {
    title: "Get document schema",
    requireAuth: false,
    auth: "none",
    props: [
      autocomplete(
        "documentType",
        "Document type",
        false,
        "Required unless a document id is given",
      ),
      autocomplete(
        "documentId",
        "Document id",
        false,
        "Resolves the type from this document instead",
      ),
      autocomplete(
        "actionType",
        "Only this action",
        false,
        "Omit to list every action",
      ),
    ],
  },
};
