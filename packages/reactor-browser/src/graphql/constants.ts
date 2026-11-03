export const DEFAULT_DRIVE_ID = "powerhouse" as const;
/**
 * @deprecated A guess, not a switchboard the app reaches. Pick one from the
 * host's switchboard directory with `resolveSwitchboard`.
 */
export const DEFAULT_SWITCHBOARD_URL = "http://localhost:4001/graphql" as const;
export const graphqlEventsToSyncDrive = [
  "CreateEmptyDocument",
  "CreateDocument",
  "AddChildren",
  "RemoveChildren",
  "MoveChildren",
  "DeleteDocument",
  "DeleteDocuments",
] as const;

export const graphqlDocumentEvents = [
  "MutateDocument",
  "MutateDocumentAsync",
  "DeleteDocument",
] as const;

export const graphqlDocumentsEvents = ["DeleteDocuments"] as const;
