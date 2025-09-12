import {
  buildDocumentRevisionsFilter,
  driveCreateDocument,
  driveDocumentReducer,
  filterOperationsByRevision,
  isAfterRevision,
  isAtRevision,
} from "document-drive";
import { setModelName } from "document-model";
import { describe, expect, it } from "vitest";
import { runAsapAsync, useSetTimeout } from "../src/utils/run-asap.js";

describe("utils", () => {
  it("should run setTimeout", async () => {
    const result = await runAsapAsync(() => Promise.resolve(1), useSetTimeout);
    expect(result).toBe(1);
  });

  it("should build document revisions filter", async () => {
    let document = driveCreateDocument();

    expect(buildDocumentRevisionsFilter(document)).toStrictEqual({
      global: -1,
      local: -1,
    });

    document = driveDocumentReducer(document, setModelName({ name: "0" }));

    expect(buildDocumentRevisionsFilter(document)).toStrictEqual({
      global: 0,
      local: -1,
    });
  });

  it("should check revisions filter", async () => {
    let document = driveCreateDocument();

    expect(isAtRevision(document)).toBe(true);
    expect(isAtRevision(document, { global: -1, local: -1 })).toBe(true);
    expect(isAtRevision(document, { global: -1 })).toBe(true);
    expect(isAtRevision(document, { local: -1 })).toBe(true);
    expect(isAtRevision(document, { global: 0, local: 0 })).toBe(false);
    expect(isAtRevision(document, { global: 0, local: -1 })).toBe(false);

    document = driveDocumentReducer(document, setModelName({ name: "0" }));
    expect(isAtRevision(document, { global: 0, local: -1 })).toBe(true);
    expect(isAtRevision(document, { global: -1, local: -1 })).toBe(false);
    expect(isAtRevision(document, { global: 0 })).toBe(true);
    expect(isAtRevision(document, { local: -1 })).toBe(true);
    expect(isAtRevision(document, { local: 0 })).toBe(false);
    expect(isAtRevision(document, { global: 0, local: 0 })).toBe(false);
    expect(isAtRevision(document, { global: 2, local: -1 })).toBe(false);
  });

  it("should check document is at least at revisions filter", async () => {
    let document = driveCreateDocument();

    expect(isAfterRevision(document)).toBe(true);
    expect(isAfterRevision(document, { global: -1, local: -1 })).toBe(false);
    expect(isAfterRevision(document, { global: -1 })).toBe(false);
    expect(isAfterRevision(document, { local: -1 })).toBe(false);
    expect(isAfterRevision(document, { global: 0, local: 0 })).toBe(false);
    expect(isAfterRevision(document, { global: 0, local: -1 })).toBe(false);

    document = driveDocumentReducer(document, setModelName({ name: "0" }));
    expect(isAfterRevision(document, { global: 0, local: -1 })).toBe(false);
    expect(isAfterRevision(document, { global: -1 })).toBe(true);
    expect(isAfterRevision(document, { global: 0 })).toBe(false);
    expect(isAfterRevision(document, { local: -1 })).toBe(false);
    expect(isAfterRevision(document, { local: 0 })).toBe(false);
    expect(isAfterRevision(document, { global: 0, local: 0 })).toBe(false);
    expect(isAfterRevision(document, { global: 2, local: -1 })).toBe(false);
  });

  it("should filter operations by revision", async () => {
    let document = driveCreateDocument();

    expect(filterOperationsByRevision(document.operations)).toStrictEqual({
      global: [],
      local: [],
    });

    document = driveDocumentReducer(document, setModelName({ name: "0" }));
    document = driveDocumentReducer(document, setModelName({ name: "1" }));
    document = driveDocumentReducer(document, setModelName({ name: "2" }));
    document = driveDocumentReducer(document, setModelName({ name: "3" }));
    document = driveDocumentReducer(document, setModelName({ name: "4" }));

    expect(filterOperationsByRevision(document.operations)).toStrictEqual(
      document.operations,
    );

    expect(
      filterOperationsByRevision(document.operations, {
        global: -1,
        local: -1,
      }),
    ).toStrictEqual({
      global: [],
      local: [],
    });

    expect(
      filterOperationsByRevision(document.operations, {
        global: 2,
      }).global,
    ).toHaveLength(3);

    expect(
      filterOperationsByRevision(document.operations, {
        global: 2,
      }),
    ).toStrictEqual({
      global: document.operations.global.slice(0, 3),
      local: [],
    });
  });
});
