import { generateActionId } from "./action-id.js";
import type { Action } from "./actions.js";
import type { PHDocument } from "./documents.js";
import { createPresignedHeader } from "./header.js";
import type { ProtocolVersions } from "./signature-policy.js";
import { defaultBaseState } from "./state.js";
import type {
  CreateDocumentAction,
  CreateDocumentActionInput,
  UpgradeDocumentActionInput,
} from "./types.js";
import { normalizeDocumentModelVersion } from "./version.js";

export function createDocumentAction(input: CreateDocumentActionInput): Action {
  return {
    id: generateActionId(),
    type: "CREATE_DOCUMENT",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

/** Sets the model version and, on the first upgrade, the initial state. */
export function upgradeDocumentAction(
  input: UpgradeDocumentActionInput,
): Action {
  return {
    id: generateActionId(),
    type: "UPGRADE_DOCUMENT",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

/** The unsigned CREATE_DOCUMENT and UPGRADE_DOCUMENT that create `document`. */
export function creationActions(
  document: PHDocument,
  protocolVersions: ProtocolVersions,
): Action[] {
  const { header } = document;
  const createInput: CreateDocumentActionInput = {
    model: header.documentType,
    version: 0,
    documentId: header.id,
    signing: {
      signature: header.id,
      publicKey: header.sig.publicKey,
      nonce: header.sig.nonce,
      createdAtUtcIso: header.createdAtUtcIso,
      documentType: header.documentType,
    },
    slug: header.slug,
    name: header.name,
    branch: header.branch,
    meta: header.meta,
    protocolVersions,
  };
  return [
    createDocumentAction(createInput),
    upgradeDocumentAction({
      documentId: header.id,
      model: header.documentType,
      fromVersion: 0,
      // imported documents may predate the document scope entirely
      toVersion: normalizeDocumentModelVersion(
        (document.state as Partial<typeof document.state>).document?.version,
      ),
      initialState: document.state,
    }),
  ];
}

/** The document a CREATE_DOCUMENT heads, before UPGRADE_DOCUMENT sets its state. */
export function documentFromCreation(action: CreateDocumentAction): PHDocument {
  const input = action.input;

  const header = createPresignedHeader();
  header.id = input.documentId;
  header.documentType = input.model;

  if (input.signing) {
    header.createdAtUtcIso = input.signing.createdAtUtcIso;
    header.lastModifiedAtUtcIso = input.signing.createdAtUtcIso;
    header.sig = {
      publicKey: input.signing.publicKey,
      nonce: input.signing.nonce,
    };
  }

  if (input.slug !== undefined) {
    header.slug = input.slug;
  }
  // Legacy: an empty slug is the id.
  if (!header.slug) {
    header.slug = input.documentId;
  }
  if (input.name !== undefined) {
    header.name = input.name;
  }
  if (input.branch !== undefined) {
    header.branch = input.branch;
  }
  if (input.meta !== undefined) {
    header.meta = input.meta;
  }
  if (input.protocolVersions !== undefined) {
    header.protocolVersions = input.protocolVersions;
  }

  // A placeholder: UPGRADE_DOCUMENT writes the model's real initial values.
  const baseState = defaultBaseState();
  return {
    header,
    operations: {},
    state: baseState,
    initialState: baseState,
    clipboard: [],
  };
}
