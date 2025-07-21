import {
  documentModelDocumentModelModule,
  DocumentModelModule,
  generateId,
  Operation,
} from "document-model";
import { beforeEach, describe, expect, it } from "vitest";
import { DocumentDriveAction } from "../src/drive-document-model/gen/actions.js";
import {
  addFolder,
  setAvailableOffline,
} from "../src/drive-document-model/gen/creators.js";
import { reducer as documentDriveReducer } from "../src/drive-document-model/gen/reducer.js";
import { DocumentDriveDocument } from "../src/drive-document-model/gen/types.js";
import { driveDocumentModelModule } from "../src/drive-document-model/module.js";
import { ReactorBuilder } from "../src/server/builder.js";
import { MemoryStorage } from "../src/storage/memory.js";

function buildOperation(
  document: DocumentDriveDocument,
  action: DocumentDriveAction,
  index?: number,
): Operation<DocumentDriveAction> {
  const newDocument = documentDriveReducer(document, action);
  const operation = newDocument.operations[action.scope].slice().pop()!;
  return { ...operation, index: index ?? operation.index };
}

function buildOperations(
  document: DocumentDriveDocument,
  actions: Array<DocumentDriveAction>,
): Operation<DocumentDriveAction>[] {
  const operations: Operation<DocumentDriveAction>[] = [];
  for (const action of actions) {
    document = documentDriveReducer(document, action);
    const operation = document.operations[action.scope].slice().pop()!;
    operations.push(operation);
  }
  return operations;
}

describe("Drive operations", () => {
  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule[];

  const storage: MemoryStorage = new MemoryStorage();
  let server = new ReactorBuilder(documentModels).withStorage(storage).build();

  beforeEach(async () => {
    server = new ReactorBuilder(documentModels).build();
    await server.initialize();
  });

  it("should be able to apply an operation to the drive", async () => {
    const id = generateId();
    await server.addDrive({
      id,
      global: { name: "test" },
      local: {
        availableOffline: false,
        sharingType: "PRIVATE",
        listeners: [],
        triggers: [],
      },
    });
    const drive = await server.getDrive(id);
    const result = await server.addDriveOperation(
      id,
      buildOperation(drive, addFolder({ id: "1", name: "test" })),
    );
    expect(result.status).toBe("SUCCESS");
  });

  it("should reject invalid operation", async () => {
    const id = generateId();
    await storage.clear();
    await server.addDrive({
      id,
      global: { name: "test" },
      local: {
        availableOffline: false,
        sharingType: "PRIVATE",
        listeners: [],
        triggers: [],
      },
    });
    const drive = await server.getDrive(id);
    await server.addDriveOperation(
      id,
      buildOperation(drive, addFolder({ id: "1", name: "test" })),
    );

    const result = await server.addDriveOperation(
      id,
      buildOperation(drive, addFolder({ id: "1", name: "test" }), 1),
    );
    expect(result.status).toBe("SUCCESS");
    expect(result.operations.find((op) => op.error)?.error).toBe(
      "Node with id 1 already exists!",
    );
  });

  it("should reject operation with missing index", async () => {
    const id = generateId();
    await server.addDrive({
      id,
      global: { name: "test" },
      local: {
        availableOffline: false,
        sharingType: "PRIVATE",
        listeners: [],
        triggers: [],
      },
    });
    const drive = await server.getDrive(id);
    await server.addDriveOperation(
      id,
      buildOperation(drive, addFolder({ id: "1", name: "test" })),
    );

    const result = await server.addDriveOperation(
      id,
      buildOperation(drive, addFolder({ id: "2", name: "test 2" }), 2),
    );
    expect(result.status).toBe("ERROR");
    expect(result.error?.message).toBe(
      "Missing operations: expected 1 with skip 0 or equivalent, got index 2 with skip 0",
    );
  });

  it("should accept operations until invalid operation", async () => {
    const id = generateId();
    await server.addDrive({
      id,
      global: { name: "test" },
      local: {
        availableOffline: false,
        sharingType: "PRIVATE",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(id);
    const result = await server.addDriveOperations(id, [
      ...buildOperations(drive, [
        addFolder({ id: "1", name: "test 1" }),
        addFolder({ id: "2", name: "test 2" }),
        addFolder({ id: "3", name: "test 3" }),
      ]),
      buildOperation(drive, addFolder({ id: "4", name: "test 4" }), 4),
    ]);

    expect(result.status).toBe("ERROR");
    expect(result.error?.message).toBe(
      "Missing operations: expected 3 with skip 0 or equivalent, got index 4 with skip 0",
    );
    expect(result.operations.length).toBe(3);

    drive = await server.getDrive(id);
    expect(drive.state.global.nodes).toStrictEqual([
      expect.objectContaining({ id: "1", name: "test 1" }),
      expect.objectContaining({ id: "2", name: "test 2" }),
      expect.objectContaining({ id: "3", name: "test 3" }),
    ]);
  });

  it("should apply operations with different scopes", async () => {
    const id = generateId();
    await server.addDrive({
      id,
      global: { name: "test" },
      local: {
        availableOffline: false,
        sharingType: "PRIVATE",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(id);
    const result = await server.addDriveOperations(
      id,
      buildOperations(drive, [
        addFolder({ id: "1", name: "test 1" }),
        addFolder({ id: "2", name: "test 2" }),
        setAvailableOffline({ availableOffline: true }),
      ]),
    );

    expect(result.status).toBe("SUCCESS");
    expect(result.operations.length).toBe(3);

    drive = await server.getDrive(id);
    expect(drive.state.global.nodes).toStrictEqual([
      expect.objectContaining({ id: "1", name: "test 1" }),
      expect.objectContaining({ id: "2", name: "test 2" }),
    ]);
    expect(drive.state.local.availableOffline).toBe(true);
  });
});
