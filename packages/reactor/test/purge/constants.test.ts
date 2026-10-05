import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  extractDeletedDocumentId,
  isDriveDeletion,
} from "../../src/processors/utils.js";
import { reshuffleByTimestamp } from "../../src/utils/reshuffle.js";
import { purgeMarker } from "./helpers.js";

const AT = "2026-09-29T00:00:00.000Z";

function withContext(
  operation: OperationWithContext["operation"],
): OperationWithContext {
  return {
    operation,
    context: {
      documentId: "drive-1",
      documentType: "powerhouse/document-drive",
      scope: "document",
      branch: "main",
      ordinal: 1,
    },
  };
}

describe("PURGE_DOCUMENT in reactor constants", () => {
  it("counts as a drive deletion, of the purged id", () => {
    const marker = withContext(purgeMarker("drive-1"));
    expect(isDriveDeletion(marker)).toBe(true);
    expect(extractDeletedDocumentId(marker)).toBe("drive-1");
  });

  it("sorts with the structure actions in a reshuffle", () => {
    const marker = purgeMarker("doc-1", { actionId: "z", timestampUtcMs: AT });
    const edit = {
      ...marker,
      id: "op-edit",
      action: { ...marker.action, id: "a", type: "SET_NAME", scope: "global" },
    };
    const merged = reshuffleByTimestamp(
      { index: 0, skip: 0 },
      [edit],
      [marker],
    );
    expect(merged.map((op) => op.action.type)).toEqual([
      "PURGE_DOCUMENT",
      "SET_NAME",
    ]);
  });
});
