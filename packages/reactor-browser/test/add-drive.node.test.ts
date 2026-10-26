// @vitest-environment happy-dom
import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import {
  hasDerivedDocumentId,
  headNewDocument,
  isDerivedDocumentId,
  signaturePolicyOf,
  type DocumentModelModule,
  type NewDocumentHeaderOptions,
  type ProtocolVersions,
  type SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { withHalves } from "./utils/client-halves.js";
import { GraphQLOperationNotSupportedError } from "../src/graphql-client/errors.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDrive } from "../src/actions/drive.js";
import type { PHGlobal } from "../src/types/global.js";

/** The client's newDocument, under a creation default and selection. */
function newDocumentUnder(policy: SignaturePolicy, versions: ProtocolVersions) {
  return (_type: string, options?: NewDocumentHeaderOptions) =>
    Promise.resolve(
      headNewDocument(
        driveDocumentModelModule as unknown as DocumentModelModule,
        options,
        policy,
        versions,
      ),
    );
}

describe("addDrive (issue #2838)", () => {
  const create = vi.fn();

  beforeEach(() => {
    create.mockReset();
    create.mockImplementation((doc: DocumentDriveDocument) =>
      Promise.resolve(doc),
    );
    window.ph = {
      reactorClient: withHalves({
        create,
        newDocument: newDocumentUnder("v2-required", { "base-reducer": 3 }),
      }),
    } as unknown as PHGlobal;
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

  it("creates a legacy drive under the client's legacy creation default", async () => {
    window.ph = {
      reactorClient: withHalves({
        create,
        newDocument: newDocumentUnder("legacy", { "base-reducer": 2 }),
      }),
    } as unknown as PHGlobal;

    await addDrive({ global: { name: "Legacy" } });

    const doc = create.mock.calls[0]![0] as DocumentDriveDocument;
    expect(signaturePolicyOf(doc.header)).toBe("legacy");
    expect(isDerivedDocumentId(doc.header.id)).toBe(false);
  });

  it("falls back to the default policy on a Switchboard without createDefaults", async () => {
    const heads = newDocumentUnder("legacy", { "base-reducer": 2 });
    window.ph = {
      reactorClient: withHalves({
        create,
        newDocument: (type: string, options?: NewDocumentHeaderOptions) =>
          options?.signaturePolicy === undefined
            ? Promise.reject(
                new GraphQLOperationNotSupportedError(
                  "getCreateSignaturePolicy",
                  "the Switchboard predates the createDefaults query",
                ),
              )
            : heads(type, options),
      }),
    } as unknown as PHGlobal;

    await addDrive({ global: { name: "Old host" } });

    const doc = create.mock.calls[0]![0] as DocumentDriveDocument;
    expect(signaturePolicyOf(doc.header)).toBe("v2-required");
  });
});
