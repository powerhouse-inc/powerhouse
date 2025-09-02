import {
  documentModelCreateDocument,
  documentModelLoadFromFile,
  documentModelReducer,
  documentModelSaveToFile,
  setModelDescription,
  setModelId,
  setModelName,
  undo,
} from "document-model";
import fs from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("DocumentModel", () => {
  const tempDir = "./test/document/temp/document-model/zip";
  let timestamp = "";
  beforeAll(() => {
    if (!fs.existsSync(tempDir))
      fs.mkdirSync(tempDir, {
        recursive: true,
      });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should save to zip", async () => {
    let documentModel = documentModelCreateDocument();
    documentModel = documentModelReducer(
      documentModel,
      setModelId({ id: "powerhouse/test" }),
    );
    await documentModelSaveToFile(documentModel, tempDir, "test");
    expect(fs.existsSync(`${tempDir}/test.phdm.zip`)).toBe(true);

    // keeps operation timestamp to check when loading
    timestamp = documentModel.operations.global[0].timestampUtcMs;
  });

  it("should load from zip", async () => {
    const documentModel = await documentModelLoadFromFile(
      `${tempDir}/test.phdm.zip`,
    );
    expect(documentModel.state.global.id).toBe("powerhouse/test");
    expect(documentModel.operations.global).toMatchObject([
      {
        hash: "xmstBdekoMQJQXwUZaOcv/Q/d9Q=",
        index: 0,
        skip: 0,
        input: { id: "powerhouse/test" },
        scope: "global",
        type: "SET_MODEL_ID",
        timestamp,
        error: undefined,
      },
    ]);
  });

  it("should not include resultingState param in operations when exporting to zip", async () => {
    let documentModel = documentModelCreateDocument();
    documentModel = documentModelReducer(
      documentModel,
      setModelId({ id: "powerhouse/test" }),
      undefined,
      { reuseOperationResultingState: true },
    );
    documentModel = documentModelReducer(
      documentModel,
      setModelDescription({ description: "desc-test" }),
      undefined,
      { reuseOperationResultingState: true },
    );
    documentModel = documentModelReducer(
      documentModel,
      setModelName({ name: "name-test" }),
      undefined,
      { reuseOperationResultingState: true },
    );

    expect(documentModel.operations.global).toHaveLength(3);
    for (const operation of documentModel.operations.global) {
      expect(operation.resultingState).toBeDefined();
    }

    await documentModelSaveToFile(
      documentModel,
      tempDir,
      "test-document-resulting-state",
    );

    const loadedDocumentModel = await documentModelLoadFromFile(
      `${tempDir}/test-document-resulting-state.phdm.zip`,
    );

    expect(loadedDocumentModel.operations.global).toHaveLength(3);
    for (const operation of loadedDocumentModel.operations.global) {
      expect(operation.resultingState).toBeUndefined();
    }
  });

  it("should keep undo state when loading from zip", async () => {
    let documentModel = documentModelCreateDocument();
    documentModel = documentModelReducer(
      documentModel,
      setModelId({ id: "powerhouse/test" }),
    );
    documentModel = documentModelReducer(documentModel, undo());
    expect(documentModel.state.global.id).toBe("");

    await documentModelSaveToFile(documentModel, tempDir, "test2");

    const loadedDocumentModel = await documentModelLoadFromFile(
      `${tempDir}/test2.phdm.zip`,
    );
    expect(loadedDocumentModel.state.global.id).toBe("");
    expect(loadedDocumentModel.operations.global).toMatchObject([
      {
        index: 1,
        skip: 1,
        scope: "global",
        type: "NOOP",
      },
    ]);

    const expectedLoadedDocumentModel = { ...documentModel };
    expectedLoadedDocumentModel.clipboard = [];
    expect(JSON.parse(JSON.stringify(loadedDocumentModel))).toStrictEqual(
      JSON.parse(JSON.stringify(expectedLoadedDocumentModel)),
    );
  });
});
