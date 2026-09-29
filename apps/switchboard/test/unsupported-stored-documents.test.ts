import { UnsupportedStoredProtocolError } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import {
  StoredDocumentsRefusedError,
  resolveUnsupportedStoredDocuments,
} from "../src/unsupported-stored-documents.mjs";

describe("resolveUnsupportedStoredDocuments", () => {
  it("refuses by default", () => {
    expect(resolveUnsupportedStoredDocuments(undefined, {})).toBe("refuse");
    expect(
      resolveUnsupportedStoredDocuments(undefined, {
        REACTOR_UNSUPPORTED_STORED_DOCUMENTS: " ",
      }),
    ).toBe("refuse");
  });

  it("reads REACTOR_UNSUPPORTED_STORED_DOCUMENTS", () => {
    expect(
      resolveUnsupportedStoredDocuments(undefined, {
        REACTOR_UNSUPPORTED_STORED_DOCUMENTS: " read-only ",
      }),
    ).toBe("read-only");
    expect(
      resolveUnsupportedStoredDocuments(undefined, {
        REACTOR_UNSUPPORTED_STORED_DOCUMENTS: "refuse",
      }),
    ).toBe("refuse");
  });

  it("lets the option win over the env var", () => {
    expect(
      resolveUnsupportedStoredDocuments("refuse", {
        REACTOR_UNSUPPORTED_STORED_DOCUMENTS: "read-only",
      }),
    ).toBe("refuse");
  });

  it("refuses an unknown value", () => {
    expect(() =>
      resolveUnsupportedStoredDocuments(undefined, {
        REACTOR_UNSUPPORTED_STORED_DOCUMENTS: "readonly",
      }),
    ).toThrow(
      'REACTOR_UNSUPPORTED_STORED_DOCUMENTS must be "refuse" or "read-only", got "readonly"',
    );
  });
});

describe("StoredDocumentsRefusedError", () => {
  it("names the versions, the count and both ways forward", () => {
    const cause = new UnsupportedStoredProtocolError(
      [
        { protocol: "base-reducer", version: 3 },
        { protocol: "base-reducer", version: 7 },
      ],
      4,
    );

    const error = new StoredDocumentsRefusedError(cause);

    expect(error.message).toBe(
      "Refusing to start: 4 stored document(s) require base-reducer 3, base-reducer 7, which this switchboard does not run. " +
        "Either start a switchboard build that runs base-reducer 3, base-reducer 7, or set REACTOR_UNSUPPORTED_STORED_DOCUMENTS=read-only to start with those documents read-only.",
    );
    expect(error.documents).toBe(4);
    expect(error.versions).toBe(cause.versions);
    expect(error.cause).toBe(cause);
    expect(StoredDocumentsRefusedError.isError(error)).toBe(true);
    expect(StoredDocumentsRefusedError.isError(cause)).toBe(false);
  });
});
