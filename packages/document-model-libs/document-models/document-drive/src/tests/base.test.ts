import { Signal } from "document-model/document";
import { DocumentDrive, actions, reducer, utils } from "../..";

describe("DocumentDrive Class", () => {
  it("should rename drive", () => {
    let documentDrive = utils.createDocument();

    expect(documentDrive.state.global.name).toBe("");

    documentDrive = reducer(
      documentDrive,
      actions.setDriveName({
        name: "new name",
      }),
    );

    expect(documentDrive.state.global.name).toBe("new name");
  });

  it("should delete children when node is deleted", () => {
    let documentDrive = utils.createDocument();
    documentDrive = reducer(
      documentDrive,
      actions.addFolder({
        id: "1",
        name: "1",
      }),
    );
    documentDrive = reducer(
      documentDrive,
      actions.addFolder({
        id: "1.1",
        name: "1.1",
        parentFolder: "1",
      }),
    );

    documentDrive = reducer(
      documentDrive,
      actions.deleteNode({
        id: "1",
      }),
    );

    expect(documentDrive.state.global.nodes.length).toBe(0);
  });

  it("should add file", () => {
    const documentDrive = new DocumentDrive(undefined);
    documentDrive.addFile({
      id: "1",
      documentType: "test",
      name: "document",
      synchronizationUnits: [
        { syncId: "1", scope: "global", branch: "main" },
        { syncId: "2", scope: "local", branch: "main" },
      ],
    });

    expect(documentDrive.state.global.nodes).toStrictEqual([
      {
        id: "1",
        kind: "file",
        parentFolder: null,
        documentType: "test",
        name: "document",
        synchronizationUnits: [
          {
            syncId: "1",
            scope: "global",
            branch: "main",
          },
          {
            syncId: "2",
            scope: "local",
            branch: "main",
          },
        ],
      },
    ]);
  });

  it("should trigger create child document signal", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    function dispatch(_signal: Signal) {}
    const documentDrive = new DocumentDrive(undefined, dispatch);
    // @ts-expect-error spying on private method
    const spy = vi.spyOn(documentDrive, "_signalDispatch");
    documentDrive.addFile({
      id: "1",
      documentType: "test",
      name: "document",
      synchronizationUnits: [
        { syncId: "1", scope: "global", branch: "main" },
        { syncId: "2", scope: "local", branch: "main" },
      ],
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.lastCall!.shift()).toStrictEqual({
      type: "CREATE_CHILD_DOCUMENT",
      input: {
        id: "1",
        document: undefined,
        documentType: "test",
        synchronizationUnits: [
          {
            branch: "main",
            scope: "global",
            syncId: "1",
          },
          {
            branch: "main",
            scope: "local",
            syncId: "2",
          },
        ],
      },
    });
  });

  it("should set local sharing type", () => {
    let documentDrive = utils.createDocument();
    documentDrive = reducer(
      documentDrive,
      actions.setSharingType({
        type: "public",
      }),
    );

    expect(documentDrive.state.local.sharingType).toBe("public");
  });

  it("should set available offline", () => {
    let documentDrive = utils.createDocument();

    expect(documentDrive.state.local.availableOffline).toBe(false);
    documentDrive = reducer(
      documentDrive,
      actions.setAvailableOffline({
        availableOffline: true,
      }),
    );

    expect(documentDrive.state.local.availableOffline).toBe(true);
  });
});
