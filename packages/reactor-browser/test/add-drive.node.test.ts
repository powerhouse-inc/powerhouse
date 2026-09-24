// @vitest-environment happy-dom
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  hasDerivedDocumentId,
  isDerivedDocumentId,
  signaturePolicyOf,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDrive } from "../src/actions/drive.js";
import type { PHGlobal } from "../src/types/global.js";

describe("addDrive (issue #2838)", () => {
  const create = vi.fn();

  beforeEach(() => {
    create.mockReset();
    create.mockImplementation((doc: DocumentDriveDocument) =>
      Promise.resolve(doc),
    );
    window.ph = { reactorClient: { create } } as unknown as PHGlobal;
  });

  afterEach(() => {
    window.ph = {};
  });

  it("uses a configured id as the document id (stable local default drives)", async () => {
    await addDrive(
      {
        id: "configured-id",
        global: { name: "My Drive", icon: "https://example.test/icon.png" },
      },
      "powerhouse/generic-drive-explorer",
    );

    expect(create).toHaveBeenCalledTimes(1);
    const doc = create.mock.calls[0]![0] as DocumentDriveDocument;
    expect(doc.header.id).toBe("configured-id");
    expect(signaturePolicyOf(doc.header)).toBe("legacy");
    expect(doc.header.meta).toEqual({
      preferredEditor: "powerhouse/generic-drive-explorer",
    });
    expect(doc.state.global.name).toBe("My Drive");
    expect(doc.state.global.icon).toBe("https://example.test/icon.png");
  });

  it("keeps the generated id when no id (or an empty one) is configured", async () => {
    await addDrive({ id: "", global: { name: "No Id" } });

    const doc = create.mock.calls[0]![0] as DocumentDriveDocument;
    expect(doc.header.id).toBeTruthy();
    expect(doc.header.id).not.toBe("");
  });

  it("creates a v2-required drive under a derived id by default", async () => {
    await addDrive({ global: { name: "Default" } });

    const doc = create.mock.calls[0]![0] as DocumentDriveDocument;
    expect(signaturePolicyOf(doc.header)).toBe("v2-required");
    expect(hasDerivedDocumentId(doc.header)).toBe(true);
  });

  it("creates a legacy drive under the full client's legacy creation default", async () => {
    window.ph = {
      reactorClient: { create },
      reactorClientModule: {
        client: { getCreateSignaturePolicy: () => Promise.resolve("legacy") },
      },
    } as unknown as PHGlobal;

    await addDrive({ global: { name: "Legacy" } });

    const doc = create.mock.calls[0]![0] as DocumentDriveDocument;
    expect(signaturePolicyOf(doc.header)).toBe("legacy");
    expect(isDerivedDocumentId(doc.header.id)).toBe(false);
  });
});
