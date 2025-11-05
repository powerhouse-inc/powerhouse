import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { driveDocumentType } from "./document-type.js";
import {
  DocumentDriveLocalStateSchema,
  DocumentDriveStateSchema,
} from "./schema/zod.js";
import type { DocumentDriveDocument, DocumentDrivePHState } from "./types.js";

/** Schema for validating the header object of a Drive document */
export const DriveDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(driveDocumentType),
});

/** Schema for validating the state object of a Drive document */
export const DrivePHStateSchema = BaseDocumentStateSchema.extend({
  global: DocumentDriveStateSchema(),
  local: DocumentDriveLocalStateSchema(),
});

export const DriveDocumentSchema = z.object({
  header: DriveDocumentHeaderSchema,
  state: DrivePHStateSchema,
  initialState: DrivePHStateSchema,
});

/** Simple helper function to check if a state object is a Drive document state object */
export function isDriveState(state: unknown): state is DocumentDrivePHState {
  return DrivePHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a Drive document state object */
export function assertIsDriveState(
  state: unknown,
): asserts state is DocumentDrivePHState {
  DrivePHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a Drive document */
export function isDriveDocument(
  document: unknown,
): document is DocumentDriveDocument {
  return DriveDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a Drive document */
export function assertIsDriveDocument(
  document: unknown,
): asserts document is DocumentDriveDocument {
  DriveDocumentSchema.parse(document);
}
