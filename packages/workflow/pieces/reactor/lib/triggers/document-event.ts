// The three document triggers the reactor feeds.

// Their hooks are never called: matching an operation against a filter is the
// host's, because the processor sees every operation in the reactor and an IPC
// round trip per operation would sit on that path. The piece declares them so
// the editor reads their props and payload shape from the same place it reads
// every other block's.
import {
  createTrigger,
  TriggerStrategy,
} from "@powerhousedao/pieces-framework";
import {
  actionTypeProp,
  documentIdProp,
  documentTypeProp,
  driveProp,
} from "../reactor.js";

// A hook that runs would mean the host stopped feeding this trigger, which is
// a bug in the host rather than something a piece can answer.
function hostFed(name: string): () => Promise<never> {
  return () =>
    Promise.reject(
      new Error(`The "${name}" trigger is fired by the reactor, not polled`),
    );
}

const OPERATION_SAMPLE = {
  documentId: "01234567-89ab-cdef-0123-456789abcdef",
  documentType: "powerhouse/workflow",
  branch: "main",
  scope: "global",
  action: { type: "SET_NAME", input: { name: "Invoice" } },
  operation: { index: 7, timestampUtcMs: "1757500000000" },
};

const LIFECYCLE_SAMPLE = {
  documentId: "01234567-89ab-cdef-0123-456789abcdef",
  documentType: "powerhouse/workflow",
  name: "Invoice",
  driveId: "fedcba98-7654-3210-fedc-ba9876543210",
  parentId: null,
  operation: { index: 0, timestampUtcMs: "1757500000000" },
};

export const documentEventTrigger = createTrigger({
  name: "document-event",
  displayName: "Document event",
  description: "Fires when a matching document operation lands.",
  type: TriggerStrategy.POLLING,
  requireAuth: false,
  props: {
    documentType: documentTypeProp(
      "Document type",
      false,
      "e.g. powerhouse/connection",
    ),
    documentId: documentIdProp(
      "Document id",
      false,
      "Omit to match any document",
    ),
    actionType: actionTypeProp(
      "Action type",
      false,
      "Omit to match any action",
    ),
  },
  sampleData: OPERATION_SAMPLE,
  onEnable: hostFed("document-event"),
  onDisable: hostFed("document-event"),
  run: hostFed("document-event"),
});

export const documentCreatedTrigger = createTrigger({
  name: "document-created",
  displayName: "Document created",
  description: "Fires when a document is added to a drive.",
  type: TriggerStrategy.POLLING,
  requireAuth: false,
  props: {
    documentType: documentTypeProp(
      "Document type",
      false,
      "Type of the created document; omit to match any",
    ),
    driveId: driveProp(
      "Drive",
      "Omit to match documents outside every drive too",
    ),
  },
  sampleData: LIFECYCLE_SAMPLE,
  onEnable: hostFed("document-created"),
  onDisable: hostFed("document-created"),
  run: hostFed("document-created"),
});

export const documentDeletedTrigger = createTrigger({
  name: "document-deleted",
  displayName: "Document deleted",
  description: "Fires when a document is removed from a drive.",
  type: TriggerStrategy.POLLING,
  requireAuth: false,
  props: {
    documentType: documentTypeProp(
      "Document type",
      false,
      "Type of the deleted document; omit to match any",
    ),
    driveId: driveProp(
      "Drive",
      "Omit to match documents outside every drive too",
    ),
  },
  sampleData: LIFECYCLE_SAMPLE,
  onEnable: hostFed("document-deleted"),
  onDisable: hostFed("document-deleted"),
  run: hostFed("document-deleted"),
});
