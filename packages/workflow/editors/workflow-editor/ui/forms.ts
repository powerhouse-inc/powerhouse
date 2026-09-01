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

const json = (
  name: string,
  displayName: string,
  required = false,
  description?: string,
): BlockFormProp => ({
  name,
  displayName,
  type: "JSON",
  required,
  description,
});

// Hand-written forms for core blocks and triggers.
export const CORE_FORMS: Record<string, BlockForm> = {
  "core#manual": { title: "Manual trigger", requireAuth: false, props: [] },
  "core#document-event": {
    title: "Document event",
    requireAuth: false,
    props: [
      text(
        "documentType",
        "Document type",
        false,
        "e.g. powerhouse/connection",
      ),
      text("documentId", "Document id", false, "Omit to match any document"),
      text("actionType", "Action type", false, "e.g. SET_ACCOUNT_LABEL"),
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
      text("documentType", "Document type", true),
      text("name", "Document name"),
      text("parentId", "Parent drive/folder id"),
      json(
        "actions",
        "Initial actions",
        false,
        '[{"type": "...", "input": {}}]',
      ),
    ],
  },
  "core#document-dispatch": {
    title: "Dispatch actions",
    requireAuth: false,
    props: [
      text(
        "documentId",
        "Document id",
        true,
        "e.g. {{steps.create.output.documentId}}",
      ),
      json("actions", "Actions", true, '[{"type": "...", "input": {}}]'),
    ],
  },
};
