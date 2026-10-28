import {
  headNewDocument,
  type DocumentModelModule,
  type NewDocumentHeaderOptions,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it, vi } from "vitest";
import type { RequestClients } from "../src/graphql/request-clients.js";
import * as resolvers from "../src/graphql/reactor/resolvers.js";

const DRIVE_ID = "drive-1";
const DOCUMENT_TYPE = documentModelDocumentModelModule.documentModel.global.id;

function client() {
  const added: PHDocument[] = [];
  const drive = {
    header: { id: DRIVE_ID, documentType: "powerhouse/document-drive" },
  };
  const newDocument = vi.fn(
    (_type: string, options?: NewDocumentHeaderOptions) =>
      Promise.resolve(
        headNewDocument(
          documentModelDocumentModelModule as unknown as DocumentModelModule,
          options,
          "v2-required",
          { "base-reducer": 3 },
        ),
      ),
  );
  const read = {
    get: vi.fn((id: string) =>
      Promise.resolve(id === DRIVE_ID ? drive : added.at(-1)),
    ),
    getDocumentModelModule: vi
      .fn()
      .mockResolvedValue(documentModelDocumentModelModule),
    newDocument,
  };
  const write = {
    drives: {
      addFile: vi.fn((_driveId: string, document: PHDocument) => {
        added.push(document);
        return Promise.resolve({
          readable: Promise.resolve({
            documentId: document.header.id,
            branch: "main",
          }),
        });
      }),
    },
  };
  const clients = { read, write } as unknown as RequestClients;
  return { clients, added, newDocument };
}

describe("create resolvers head a new document with the client's newDocument", () => {
  it.each([
    [
      "createEmptyDocument",
      (c: RequestClients) =>
        resolvers.createEmptyDocument(c, {
          documentType: DOCUMENT_TYPE,
          parentIdOrSlug: DRIVE_ID,
        }),
    ],
    [
      "createDocumentWithInitialState",
      (c: RequestClients) =>
        resolvers.createDocumentWithInitialState(c, {
          documentType: DOCUMENT_TYPE,
          parentIdOrSlug: DRIVE_ID,
          initialState: {},
        }),
    ],
  ])("%s", async (_name, run) => {
    const { clients, added, newDocument } = client();

    await run(clients);

    expect(newDocument).toHaveBeenCalledWith(
      DOCUMENT_TYPE,
      expect.objectContaining({ parentIdentifier: DRIVE_ID }),
    );
    expect(added[0].header.protocolVersions).toEqual({
      "base-reducer": 3,
      signature: 2,
    });
  });
});
