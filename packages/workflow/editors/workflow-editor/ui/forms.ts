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
  props: BlockFormProp[];
}

export interface DesignTimeService {
  getBlockForm: (blockType: string) => Promise<BlockForm | null>;
  loadOptions: (
    blockType: string,
    propName: string,
    input: Record<string, unknown>,
    connectionId?: string,
  ) => Promise<unknown>;
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

// Hand-written forms for core blocks and triggers.
export const CORE_FORMS: Record<string, BlockForm> = {
  "core#manual": { title: "Manual trigger", requireAuth: false, props: [] },
  "core#document-event": {
    title: "Document event",
    requireAuth: false,
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
    ],
  },
};
