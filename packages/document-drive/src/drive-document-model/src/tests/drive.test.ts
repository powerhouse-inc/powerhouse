/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import type { DocumentDriveDocument } from "document-drive";
import {
  createDocument,
  driveDocumentReducer,
  setAvailableOffline,
  SetAvailableOfflineInputSchema,
  setDriveName,
  SetDriveNameInputSchema,
  setSharingType,
  SetSharingTypeInputSchema,
} from "document-drive";
import { beforeEach, describe, expect, it } from "vitest";
import { generateMock } from "./generate-mock.js";

describe("Drive Operations", () => {
  let document: DocumentDriveDocument;

  beforeEach(() => {
    document = createDocument();
  });

  it("should handle setDriveName operation", () => {
    const input = generateMock(SetDriveNameInputSchema());
    const updatedDocument = driveDocumentReducer(document, setDriveName(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_DRIVE_NAME",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setSharingType operation", () => {
    const input = generateMock(SetSharingTypeInputSchema());
    const updatedDocument = driveDocumentReducer(
      document,
      setSharingType(input),
    );

    expect(updatedDocument.operations.local).toHaveLength(1);
    expect(updatedDocument.operations.local[0].action.type).toBe(
      "SET_SHARING_TYPE",
    );
    expect(updatedDocument.operations.local[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.local[0].index).toEqual(0);
  });

  it("should handle setAvailableOffline operation", () => {
    const input = generateMock(SetAvailableOfflineInputSchema());
    const updatedDocument = driveDocumentReducer(
      document,
      setAvailableOffline(input),
    );

    expect(updatedDocument.operations.local).toHaveLength(1);
    expect(updatedDocument.operations.local[0].action.type).toBe(
      "SET_AVAILABLE_OFFLINE",
    );
    expect(updatedDocument.operations.local[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.local[0].index).toEqual(0);
  });
});
