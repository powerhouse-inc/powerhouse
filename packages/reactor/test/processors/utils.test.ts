import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { ProcessorFilter } from "@powerhousedao/shared/processors";
import { describe, expect, it } from "vitest";
import { matchesFilter } from "../../src/processors/utils.js";

function createOperation(context: {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
}): OperationWithContext {
  return {
    operation: {
      id: "op-1",
      index: 0,
      skip: 0,
      hash: "hash",
      timestampUtcMs: new Date().toISOString(),
      action: {
        id: "action-1",
        type: "TEST_ACTION",
        scope: context.scope,
        timestampUtcMs: new Date().toISOString(),
        input: {},
      },
    },
    context: {
      documentId: context.documentId,
      documentType: context.documentType,
      scope: context.scope,
      branch: context.branch,
      ordinal: 1,
    },
  };
}

describe("matchesFilter", () => {
  describe("empty filter", () => {
    it("should match all operations when filter is empty", () => {
      const op = createOperation({
        documentId: "doc-1",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
      });
      const filter: ProcessorFilter = {};

      expect(matchesFilter(op, filter)).toBe(true);
    });
  });

  describe("documentType filtering", () => {
    it("should match when documentType is in the filter array", () => {
      const op = createOperation({
        documentId: "doc-1",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
      });
      const filter: ProcessorFilter = {
        documentType: ["powerhouse/document-model", "powerhouse/package"],
      };

      expect(matchesFilter(op, filter)).toBe(true);
    });

    it("should not match when documentType is not in the filter array", () => {
      const op = createOperation({
        documentId: "doc-1",
        documentType: "powerhouse/unknown",
        scope: "global",
        branch: "main",
      });
      const filter: ProcessorFilter = {
        documentType: ["powerhouse/document-model", "powerhouse/package"],
      };

      expect(matchesFilter(op, filter)).toBe(false);
    });

    it("should match all when documentType array is empty", () => {
      const op = createOperation({
        documentId: "doc-1",
        documentType: "powerhouse/any-type",
        scope: "global",
        branch: "main",
      });
      const filter: ProcessorFilter = {
        documentType: [],
      };

      expect(matchesFilter(op, filter)).toBe(true);
    });
  });

  describe("scope filtering", () => {
    it("should match when scope is in the filter array", () => {
      const op = createOperation({
        documentId: "doc-1",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
      });
      const filter: ProcessorFilter = {
        scope: ["global", "local"],
      };

      expect(matchesFilter(op, filter)).toBe(true);
    });

    it("should not match when scope is not in the filter array", () => {
      const op = createOperation({
        documentId: "doc-1",
        documentType: "powerhouse/document-model",
        scope: "document",
        branch: "main",
      });
      const filter: ProcessorFilter = {
        scope: ["global"],
      };

      expect(matchesFilter(op, filter)).toBe(false);
    });
  });

  describe("branch filtering", () => {
    it("should match when branch is in the filter array", () => {
      const op = createOperation({
        documentId: "doc-1",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
      });
      const filter: ProcessorFilter = {
        branch: ["main", "develop"],
      };

      expect(matchesFilter(op, filter)).toBe(true);
    });

    it("should not match when branch is not in the filter array", () => {
      const op = createOperation({
        documentId: "doc-1",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "feature-branch",
      });
      const filter: ProcessorFilter = {
        branch: ["main"],
      };

      expect(matchesFilter(op, filter)).toBe(false);
    });
  });

  describe("documentId filtering", () => {
    it("should match when documentId is in the filter array", () => {
      const op = createOperation({
        documentId: "doc-1",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
      });
      const filter: ProcessorFilter = {
        documentId: ["doc-1", "doc-2"],
      };

      expect(matchesFilter(op, filter)).toBe(true);
    });

    it("should not match when documentId is not in the filter array", () => {
      const op = createOperation({
        documentId: "doc-3",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
      });
      const filter: ProcessorFilter = {
        documentId: ["doc-1", "doc-2"],
      };

      expect(matchesFilter(op, filter)).toBe(false);
    });

    it("should match any documentId when filter contains '*' wildcard", () => {
      const op = createOperation({
        documentId: "b82e44f0-dd03-4532-a048-cb48246a784c",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
      });
      const filter: ProcessorFilter = {
        documentId: ["*"],
      };

      expect(matchesFilter(op, filter)).toBe(true);
    });

    it("should match when filter contains '*' wildcard among other IDs", () => {
      const op = createOperation({
        documentId: "any-random-id",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
      });
      const filter: ProcessorFilter = {
        documentId: ["specific-id", "*"],
      };

      expect(matchesFilter(op, filter)).toBe(true);
    });
  });

  describe("combined filters", () => {
    it("should match when all filter conditions are satisfied", () => {
      const op = createOperation({
        documentId: "b82e44f0-dd03-4532-a048-cb48246a784c",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
      });
      const filter: ProcessorFilter = {
        branch: ["main"],
        documentId: ["*"],
        documentType: [
          "powerhouse/document-model",
          "powerhouse/package",
          "powerhouse/document-editor",
          "powerhouse/subgraph",
          "powerhouse/processor",
          "powerhouse/app",
        ],
        scope: ["global"],
      };

      expect(matchesFilter(op, filter)).toBe(true);
    });

    it("should not match when any filter condition fails", () => {
      const op = createOperation({
        documentId: "doc-1",
        documentType: "powerhouse/document-model",
        scope: "local",
        branch: "main",
      });
      const filter: ProcessorFilter = {
        documentType: ["powerhouse/document-model"],
        scope: ["global"],
        branch: ["main"],
      };

      expect(matchesFilter(op, filter)).toBe(false);
    });
  });

  describe("user-provided test case", () => {
    it("should return true for the provided input that was failing", () => {
      const op: OperationWithContext = {
        operation: {
          id: "op-1",
          index: 0,
          skip: 0,
          hash: "hash",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-1",
            type: "TEST_ACTION",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {},
          },
        },
        context: {
          documentId: "b82e44f0-dd03-4532-a048-cb48246a784c",
          scope: "global",
          branch: "main",
          documentType: "powerhouse/document-model",
          resultingState:
            '{"auth":{},"document":{"hash":{"encoding":"base64","algorithm":"sha1"},"version":1},"local":{},"global":{"id":"a","name":"a","author":{"name":"","website":""},"extension":"","description":"","specifications":[{"state":{"local":{"schema":"","examples":[],"initialValue":""},"global":{"schema":"type AState {\\n  \\"Add your global state fields here\\"\\n  _placeholder: String\\n}","examples":[],"initialValue":"{\\n  \\"_placeholder\\": null\\n}"}},"modules":[],"version":1,"changeLog":[]}]},"header":{"id":"b82e44f0-dd03-4532-a048-cb48246a784c","sig":{"publicKey":{},"nonce":""},"documentType":"powerhouse/document-model","createdAtUtcIso":"2026-01-20T22:29:06.770Z","slug":"b82e44f0-dd03-4532-a048-cb48246a784c","name":"a","branch":"main","revision":{"document":2,"global":4},"lastModifiedAtUtcIso":"2026-01-20T22:30:09.533Z","meta":{},"protocolVersions":{"base-reducer":2}}}',
          ordinal: 10,
        },
      };

      const filter: ProcessorFilter = {
        branch: ["main"],
        documentId: ["*"],
        documentType: [
          "powerhouse/document-model",
          "powerhouse/package",
          "powerhouse/document-editor",
          "powerhouse/subgraph",
          "powerhouse/processor",
          "powerhouse/app",
        ],
        scope: ["global"],
      };

      expect(matchesFilter(op, filter)).toBe(true);
    });
  });
});
