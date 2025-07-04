import { Signal } from "document-model";
import { describe, expect, it, vi } from "vitest";
import {
  addFolder,
  deleteNode,
  setAvailableOffline,
  setDriveName,
  setSharingType,
} from "../../gen/creators.js";
import { DocumentDrive as DocumentDriveClass } from "../../gen/object.js";
import { reducer } from "../../gen/reducer.js";
import { createDocument } from "../../gen/utils.js";
describe("DocumentDrive Class", () => {
  it("should rename drive", () => {
    let documentDrive = createDocument();

    expect(documentDrive.state.global.name).toBe("");

    documentDrive = reducer(
      documentDrive,
      setDriveName({
        name: "new name",
      }),
    );

    expect(documentDrive.state.global.name).toBe("new name");
  });

  it("should delete children when node is deleted", () => {
    let documentDrive = createDocument();
    documentDrive = reducer(
      documentDrive,
      addFolder({
        id: "1",
        name: "1",
      }),
    );
    documentDrive = reducer(
      documentDrive,
      addFolder({
        id: "1.1",
        name: "1.1",
        parentFolder: "1",
      }),
    );

    documentDrive = reducer(
      documentDrive,
      deleteNode({
        id: "1",
      }),
    );

    expect(documentDrive.state.global.nodes.length).toBe(0);
  });

  it("should add file", () => {
    const documentDrive = new DocumentDriveClass();
    documentDrive.addFile({
      id: "1",
      documentType: "test",
      name: "document",
    });

    expect(documentDrive.state.global.nodes).toStrictEqual([
      {
        id: "1",
        kind: "file",
        parentFolder: null,
        documentType: "test",
        name: "document",
      },
    ]);
  });

  it("should trigger create child document signal", () => {
    function dispatch(_signal: Signal) {}
    const documentDrive = new DocumentDriveClass(undefined, dispatch);
    // @ts-expect-error spying on private method
    const spy = vi.spyOn(documentDrive, "_signalDispatch");
    documentDrive.addFile({
      id: "1",
      documentType: "test",
      name: "document",
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.lastCall!.shift()).toStrictEqual({
      type: "CREATE_CHILD_DOCUMENT",
      input: {
        id: "1",
        document: undefined,
        documentType: "test",
      },
    });
  });

  it("should set local sharing type", () => {
    let documentDrive = createDocument();
    documentDrive = reducer(
      documentDrive,
      setSharingType({
        type: "public",
      }),
    );

    expect(documentDrive.state.local.sharingType).toBe("public");
  });

  it("should set available offline", () => {
    let documentDrive = createDocument();

    expect(documentDrive.state.local.availableOffline).toBe(false);
    documentDrive = reducer(
      documentDrive,
      setAvailableOffline({
        availableOffline: true,
      }),
    );

    expect(documentDrive.state.local.availableOffline).toBe(true);
  });
});
