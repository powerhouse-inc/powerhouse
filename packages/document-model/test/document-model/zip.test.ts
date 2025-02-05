import {
  setModelId,
  setModelDescription,
  setModelName,
} from "@document-model/gen/creators.js";
import { reducer } from "@document-model/gen/reducer.js";
import {
  createDocument,
  loadFromFile,
  saveToFile,
} from "@document-model/index.js";
import { undo } from "@document/actions/creators.js";
import fs from "fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

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
    let documentModel = createDocument();
    documentModel = reducer(
      documentModel,
      setModelId({ id: "powerhouse/test" }),
    );
    await saveToFile(documentModel, tempDir, "test");
    expect(fs.existsSync(`${tempDir}/test.phdm.zip`)).toBe(true);

    // keeps operation timestamp to check when loading
    timestamp = documentModel.operations.global[0].timestamp;
  });

  it("should load from zip", async () => {
    const documentModel = await loadFromFile(`${tempDir}/test.phdm.zip`);
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
    let documentModel = createDocument();
    documentModel = reducer(
      documentModel,
      setModelId({ id: "powerhouse/test" }),
      undefined,
      { reuseOperationResultingState: true },
    );
    documentModel = reducer(
      documentModel,
      setModelDescription({ description: "desc-test" }),
      undefined,
      { reuseOperationResultingState: true },
    );
    documentModel = reducer(
      documentModel,
      setModelName({ name: "name-test" }),
      undefined,
      { reuseOperationResultingState: true },
    );

    expect(documentModel.operations.global).toHaveLength(3);
    for (const operation of documentModel.operations.global) {
      expect(operation.resultingState).toBeDefined();
    }

    await saveToFile(documentModel, tempDir, "test-document-resulting-state");

    const loadedDocumentModel = await loadFromFile(
      `${tempDir}/test-document-resulting-state.phdm.zip`,
    );

    expect(loadedDocumentModel.operations.global).toHaveLength(3);
    for (const operation of loadedDocumentModel.operations.global) {
      expect(operation.resultingState).toBeUndefined();
    }
  });

  it("should keep undo state when loading from zip", async () => {
    let documentModel = createDocument();
    documentModel = reducer(
      documentModel,
      setModelId({ id: "powerhouse/test" }),
    );
    documentModel = reducer(documentModel, undo());
    expect(documentModel.state.global.id).toBe("");

    await saveToFile(documentModel, tempDir, "test2");

    const loadedDocumentModel = await loadFromFile(`${tempDir}/test2.phdm.zip`);
    expect(loadedDocumentModel.state.global.id).toBe("");
    expect(loadedDocumentModel.operations.global).toMatchObject([
      {
        index: 1,
        skip: 1,
        input: {},
        scope: "global",
        type: "NOOP",
      },
    ]);

    const expectedLoadedDocumentModel = { ...documentModel };
    expectedLoadedDocumentModel.clipboard = [];
    expect(loadedDocumentModel).toStrictEqual(expectedLoadedDocumentModel);
  });
});
