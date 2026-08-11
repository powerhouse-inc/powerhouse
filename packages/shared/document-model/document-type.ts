export const documentModelDocumentType = "powerhouse/document-model";
export const groupDocumentType = "powerhouse/reactor-group";

/**
 * The group-model action types that change membership. The groups projection
 * filters its reads to these, so any other group operation is invisible to a
 * decision. Kept here so the reactor never depends on the group package; a
 * reactor-group test guards against drift.
 */
export const groupMembershipActionTypes = [
  "ADD_MEMBER",
  "REMOVE_MEMBER",
] as const;
