import {
  addFolder,
  deleteNode,
  driveCreateDocument,
  driveDocumentReducer,
  setAvailableOffline,
  setDriveName,
  setSharingType,
} from "document-drive";
import { describe, expect, it } from "vitest";
describe("DocumentDrive Class", () => {
  it("should rename drive", () => {
    let documentDrive = driveCreateDocument();

    expect(documentDrive.state.global.name).toBe("");

    documentDrive = driveDocumentReducer(
      documentDrive,
      setDriveName({
        name: "new name",
      }),
    );

    expect(documentDrive.state.global.name).toBe("new name");
  });

  it("should delete children when node is deleted", () => {
    let documentDrive = driveCreateDocument();
    documentDrive = driveDocumentReducer(
      documentDrive,
      addFolder({
        id: "1",
        name: "1",
      }),
    );
    documentDrive = driveDocumentReducer(
      documentDrive,
      addFolder({
        id: "1.1",
        name: "1.1",
        parentFolder: "1",
      }),
    );

    documentDrive = driveDocumentReducer(
      documentDrive,
      deleteNode({
        id: "1",
      }),
    );

    expect(documentDrive.state.global.nodes.length).toBe(0);
  });

  it("should set local sharing type", () => {
    let documentDrive = driveCreateDocument();
    documentDrive = driveDocumentReducer(
      documentDrive,
      setSharingType({
        type: "public",
      }),
    );

    expect(documentDrive.state.local.sharingType).toBe("public");
  });

  it("should set available offline", () => {
    let documentDrive = driveCreateDocument();

    expect(documentDrive.state.local.availableOffline).toBe(false);
    documentDrive = driveDocumentReducer(
      documentDrive,
      setAvailableOffline({
        availableOffline: true,
      }),
    );

    expect(documentDrive.state.local.availableOffline).toBe(true);
  });
});
