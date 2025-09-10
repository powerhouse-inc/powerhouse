import {
  baseCreateDocument,
  createReducer,
  generateUUIDBrowser,
  hashBrowser,
  replayDocument,
  validateOperations,
} from "document-model";
import { generateUUIDNode, getLocalFile, hashNode } from "document-model/node";

import {
  countReducer,
  createCountDocumentState,
  fakeAction,
  increment,
  mutableCountReducer,
  setLocalName,
  testCreateBaseState,
  type CountDocument,
} from "document-model/test";
import fs from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Base utils", () => {
  const tempDir = "./test/document/temp/utils/";
  const tempFile = `${tempDir}report.pdf`;

  beforeAll(() => {
    if (!fs.existsSync(tempDir))
      fs.mkdirSync(tempDir, {
        recursive: true,
      });
    fs.writeFileSync(tempFile, "TEST");
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should parse file attributes", async () => {
    const file = await getLocalFile(tempFile);
    expect(file).toStrictEqual({
      data: "VEVTVA==",
      hash: "Q1pqSc2iiEdpNLjRefhjnQ3nNc8=",
      mimeType: "application/pdf",
      extension: "pdf",
      fileName: "report.pdf",
    });
  });

  it("should throw exception when file doesn't exists", async () => {
    await expect(getLocalFile("as")).rejects.toBeDefined();
  });

  it("should generateId in browser and node", () => {
    expect(generateUUIDNode()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(generateUUIDBrowser()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(generateUUIDNode().length).toEqual(generateUUIDBrowser().length);
    expect(generateUUIDNode()).not.toEqual(generateUUIDBrowser());
  });

  it("should hash in browser and node", () => {
    expect(hashNode("test")).toEqual(hashBrowser("test"));
  });

  it("should find invalid index oprations", () => {
    const a1 = fakeAction({
      type: "TEST_ACTION",
      input: { id: "test" },
      scope: "global",
    });
    const a2 = fakeAction({
      type: "TEST_ACTION",
      input: { id: "test" },
      scope: "global",
    });
    const a3 = fakeAction({
      type: "TEST_ACTION",
      input: { id: "test" },
      scope: "local",
    });
    const errors = validateOperations({
      global: [
        {
          hash: "",
          index: 0,
          skip: 0,
          timestampUtcMs: "",
          action: a1,
        },
        {
          hash: "",
          index: 0,
          skip: 0,
          timestampUtcMs: "",
          action: a2,
        },
      ],
      local: [
        {
          hash: "",
          index: 0,
          skip: 0,
          timestampUtcMs: "",
          action: a3,
        },
      ],
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toStrictEqual(
      "Invalid operation index 0 at position 1",
    );
  });

  it("should work with garbage collected operations", () => {
    const errors = validateOperations({
      global: [
        {
          hash: "",
          index: 0,
          skip: 0,
          timestampUtcMs: "",
          action: fakeAction({
            type: "TEST_ACTION",
            input: { id: "test" },
            scope: "global",
          }),
        },
        {
          hash: "",
          index: 1,
          skip: 0,
          timestampUtcMs: "",
          action: fakeAction({
            type: "TEST_ACTION",
            input: { id: "test" },
            scope: "global",
          }),
        },
        {
          hash: "",
          index: 3,
          skip: 1,
          timestampUtcMs: "",
          action: fakeAction({
            type: "TEST_ACTION",
            input: { id: "test" },
            scope: "global",
          }),
        },
      ],
      local: [
        {
          hash: "",
          index: 0,
          skip: 0,
          timestampUtcMs: "",
          action: fakeAction({
            type: "TEST_ACTION",
            input: { id: "test" },
            scope: "local",
          }),
        },
      ],
    });

    expect(errors).toHaveLength(0);
  });

  it("should replay document and keep lastModified timestamp", async () => {
    const document = baseCreateDocument<CountPHState>(
      createCountDocumentState,
      testCreateBaseState({ count: 0 }, { name: "" }),
    );
    const newDocument = countReducer(document, setLocalName("test"));

    await new Promise((resolve) => setTimeout(resolve, 100));
    const replayedDocument = replayDocument(
      document.initialState,
      newDocument.operations,
      countReducer,
    );

    expect(newDocument.state).toStrictEqual(replayedDocument.state);
    expect(newDocument.header.lastModifiedAtUtcIso).toBe(
      replayedDocument.header.lastModifiedAtUtcIso,
    );
    expect(
      newDocument.operations.global.map((o) => o.timestampUtcMs),
    ).toStrictEqual(
      replayedDocument.operations.global.map((o) => o.timestampUtcMs),
    );
  });

  it("should work with mutable reducer", () => {
    const reducer = createReducer<CountPHState>(mutableCountReducer);
    const document = baseCreateDocument<CountPHState>(
      createCountDocumentState,
      testCreateBaseState({ count: 0 }, { name: "" }),
    );
    const newDocument = reducer(document, increment());
    expect(newDocument.state.global.count).toBe(1);
    expect(document.state.global.count).toBe(0);

    const finalDocument = reducer(newDocument, setLocalName("test"));
    expect(newDocument.state.local.name).toBe("");
    expect(finalDocument.state.local.name).toBe("test");
  });
});
