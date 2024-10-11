import fs from "fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createDocument,
  createReducer,
  createUnsafeReducer,
  getLocalFile,
  replayDocument,
  validateOperations,
} from "../../src/document/utils";
import { hash as hashBrowser } from "../../src/document/utils/browser";
import { hash as hashNode } from "../../src/document/utils/node";
import {
  baseCountReducer,
  CountAction,
  CountLocalState,
  countReducer,
  CountState,
  increment,
  mutableCountReducer,
  setLocalName,
} from "../helpers";

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

  it("should hash in browser and node", () => {
    expect(hashNode("test")).toEqual(hashBrowser("test"));
  });

  it("should find invalid index oprations", () => {
    const errors = validateOperations({
      global: [
        {
          scope: "global",
          hash: "",
          index: 0,
          skip: 0,
          timestamp: "",
          type: "TEST_ACTION",
          input: { id: "test" },
        },
        {
          scope: "global",
          hash: "",
          index: 0,
          skip: 0,
          timestamp: "",
          type: "TEST_ACTION",
          input: { id: "test" },
        },
      ],
      local: [
        {
          scope: "local",
          hash: "",
          index: 0,
          skip: 0,
          timestamp: "",
          type: "TEST_ACTION",
          input: { id: "test" },
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
          scope: "global",
          hash: "",
          index: 0,
          skip: 0,
          timestamp: "",
          type: "TEST_ACTION",
          input: { id: "test" },
        },
        {
          scope: "global",
          hash: "",
          index: 1,
          skip: 0,
          timestamp: "",
          type: "TEST_ACTION",
          input: { id: "test" },
        },
        {
          scope: "global",
          hash: "",
          index: 3,
          skip: 1,
          timestamp: "",
          type: "TEST_ACTION",
          input: { id: "test" },
        },
      ],
      local: [
        {
          scope: "local",
          hash: "",
          index: 0,
          skip: 0,
          timestamp: "",
          type: "TEST_ACTION",
          input: { id: "test" },
        },
      ],
    });

    expect(errors).toHaveLength(0);
  });

  it("should replay document and keep lastModified timestamp", async () => {
    const document = createDocument<CountState, CountAction, CountLocalState>({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });
    const newDocument = countReducer(document, setLocalName("test"));

    await new Promise((resolve) => setTimeout(resolve, 100));
    const replayedDocument = replayDocument(
      document.initialState,
      newDocument.operations,
      countReducer,
      undefined,
    );

    expect(newDocument.state).toStrictEqual(replayedDocument.state);
    expect(newDocument.lastModified).toBe(replayedDocument.lastModified);
  });

  it("should mutate state on unsafeReducer", () => {
    const unsafeReducer = createUnsafeReducer(baseCountReducer);
    const document = createDocument<CountState, CountAction, CountLocalState>({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });

    const newDocument = countReducer(document, increment());
    expect(newDocument.state.global.count).toBe(1);
    expect(document.state.global.count).toBe(0);

    const unsafeDocument = createDocument<
      CountState,
      CountAction,
      CountLocalState
    >({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });
    const newUnsafeDocument = unsafeReducer(unsafeDocument, increment());
    expect(newUnsafeDocument.state.global.count).toBe(1);
    expect(unsafeDocument.state.global.count).toBe(1);
  });

  it("should work with mutable reducer", () => {
    const reducer = createReducer(mutableCountReducer);
    const document = createDocument<CountState, CountAction, CountLocalState>({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });
    const newDocument = reducer(document, increment());
    expect(newDocument.state.global.count).toBe(1);
    expect(document.state.global.count).toBe(0);

    const finalDocument = reducer(newDocument, setLocalName("test"));
    expect(newDocument.state.local.name).toBe("");
    expect(finalDocument.state.local.name).toBe("test");
  });
});
