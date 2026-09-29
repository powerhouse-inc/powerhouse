import {
  purgeDocumentAction,
  purgeMarkerOperation,
  type OperationWithContext,
} from "document-model";
import { describe, expect, it, vi } from "vitest";
import type { AnalyticsPath } from "../../analytics/analytics-path.js";
import type { IAnalyticsStore } from "../../analytics/types.js";
import { DocumentAnalyticsProcessor } from "./document-processor.js";
import { DriveAnalyticsProcessor } from "./drive-processor.js";

const DRIVE = "powerhouse/document-drive";

function op(
  documentId: string,
  documentType: string,
  type: string,
  ordinal: number,
  scope = "global",
): OperationWithContext {
  return {
    operation: {
      id: `op-${ordinal}`,
      index: ordinal,
      skip: 0,
      hash: "",
      timestampUtcMs: new Date(ordinal).toISOString(),
      action: {
        id: `action-${ordinal}`,
        type,
        scope,
        timestampUtcMs: new Date(ordinal).toISOString(),
        input: type === "DELETE_DOCUMENT" ? { documentId } : {},
      },
    },
    context: {
      documentId,
      documentType,
      scope,
      branch: "main",
      ordinal,
    },
  };
}

function marker(documentId: string, documentType: string, ordinal: number) {
  const operation = purgeMarkerOperation(
    purgeDocumentAction({ documentId, documentType, requestId: "r" }),
  );
  return {
    operation,
    context: {
      documentId,
      documentType,
      scope: "document",
      branch: "main",
      ordinal,
    },
  } satisfies OperationWithContext;
}

function recordingStore() {
  const calls: string[] = [];
  const store = {
    addSeriesValues: vi.fn((inputs: { source: AnalyticsPath }[]) => {
      for (const input of inputs) calls.push(`add ${input.source.toString()}`);
      return Promise.resolve();
    }),
    clearSeriesBySource: vi.fn((source: AnalyticsPath, cleanUp?: boolean) => {
      calls.push(`clear ${source.toString()} ${cleanUp}`);
      return Promise.resolve(0);
    }),
  };
  return { calls, store: store as unknown as IAnalyticsStore };
}

describe("drive analytics processors on deletion", () => {
  it.each([
    [
      "DELETE_DOCUMENT",
      (id: string) => op(id, "a/doc", "DELETE_DOCUMENT", 2, "document"),
    ],
    ["PURGE_DOCUMENT", (id: string) => marker(id, "a/doc", 2)],
  ])("clears a document's series on %s", async (_, deletion) => {
    const { calls, store } = recordingStore();
    const processor = new DocumentAnalyticsProcessor(store);

    await processor.onOperations([
      op("doc-1", "a/doc", "EDIT", 1),
      deletion("doc-1"),
      op("doc-2", "a/doc", "EDIT", 3),
    ]);

    expect(calls).toEqual([
      "add ph/doc/doc-1/main/global",
      "clear ph/doc/doc-1 true",
      "add ph/doc/doc-2/main/global",
    ]);
  });

  it.each([
    [
      "DELETE_DOCUMENT",
      (id: string) => op(id, DRIVE, "DELETE_DOCUMENT", 2, "document"),
    ],
    ["PURGE_DOCUMENT", (id: string) => marker(id, DRIVE, 2)],
  ])("clears a drive's series on %s", async (_, deletion) => {
    const { calls, store } = recordingStore();
    const processor = new DriveAnalyticsProcessor(store);

    await processor.onOperations([
      op("drive-1", DRIVE, "ADD_FILE", 1),
      deletion("drive-1"),
    ]);

    expect(calls).toEqual([
      "add ph/drive/drive-1/main/global",
      "clear ph/drive/drive-1 true",
    ]);
  });
});
