import { describe, expect, it } from "vitest";
import { DocumentNotFoundError } from "../../src/shared/errors.js";
import { ChannelError } from "../../src/sync/errors.js";
import { ChannelErrorSource } from "../../src/sync/types.js";
import {
  classifyJobFailure,
  quarantinesDocument,
  syncOperationErrorType,
} from "../../src/sync/utils.js";

describe("missing-ancestor inbox failures", () => {
  it("classifies a missing ancestor as something other than UNCLASSIFIED", () => {
    expect(classifyJobFailure("DocumentNotFoundError")).not.toBe(
      "UNCLASSIFIED",
    );
    expect(classifyJobFailure("DocumentPurgedError")).toBe("DOCUMENT_PURGED");
    expect(classifyJobFailure("DocumentNotFoundError")).not.toBe(
      "DOCUMENT_PURGED",
    );
  });

  it("does not quarantine a document for a missing ancestor", () => {
    const classification = classifyJobFailure("DocumentNotFoundError");
    expect(quarantinesDocument(classification)).toBe(false);
  });

  it("classifies the ChannelError the inbox path builds", () => {
    const underlying = new DocumentNotFoundError("vq9tPk");
    const channelError = new ChannelError(
      ChannelErrorSource.Inbox,
      new Error(`Failed to apply operations: ${underlying.message}`),
      classifyJobFailure(underlying.name),
    );

    const errorType = syncOperationErrorType(channelError);
    expect(errorType).not.toBe("UNCLASSIFIED");
    expect(quarantinesDocument(errorType)).toBe(false);
  });
});
