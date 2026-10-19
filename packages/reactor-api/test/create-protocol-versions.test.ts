import type { IReactorClient } from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it, vi } from "vitest";
import * as resolvers from "../src/graphql/reactor/resolvers.js";

const DRIVE_ID = "drive-1";
const DOCUMENT_TYPE = documentModelDocumentModelModule.documentModel.global.id;

function client() {
  const added: PHDocument[] = [];
  const drive = {
    header: { id: DRIVE_ID, documentType: "powerhouse/document-drive" },
  };
  const getCreateProtocolVersions = vi
    .fn()
    .mockResolvedValue({ "base-reducer": 3 });
  const reactorClient = {
    get: vi.fn((id: string) =>
      Promise.resolve(id === DRIVE_ID ? drive : added.at(-1)),
    ),
    getDocumentModelModule: vi
      .fn()
      .mockResolvedValue(documentModelDocumentModelModule),
    getCreateSignaturePolicy: vi.fn().mockResolvedValue("v2-required"),
    getCreateProtocolVersions,
    drives: {
      addFile: vi.fn((_driveId: string, document: PHDocument) => {
        added.push(document);
        return Promise.resolve(document);
      }),
    },
  } as unknown as IReactorClient;
  return { reactorClient, added, getCreateProtocolVersions };
}

describe("create resolvers head a new document at the client's create versions", () => {
  it.each([
    [
      "createEmptyDocument",
      (c: IReactorClient) =>
        resolvers.createEmptyDocument(c, {
          documentType: DOCUMENT_TYPE,
          parentIdOrSlug: DRIVE_ID,
        }),
    ],
    [
      "createDocumentWithInitialState",
      (c: IReactorClient) =>
        resolvers.createDocumentWithInitialState(c, {
          documentType: DOCUMENT_TYPE,
          parentIdOrSlug: DRIVE_ID,
          initialState: {},
        }),
    ],
  ])("%s", async (_name, run) => {
    const { reactorClient, added, getCreateProtocolVersions } = client();

    await run(reactorClient);

    expect(getCreateProtocolVersions).toHaveBeenCalledWith({
      documentType: DOCUMENT_TYPE,
      parentIdentifier: DRIVE_ID,
    });
    expect(added[0].header.protocolVersions).toEqual({
      "base-reducer": 3,
      signature: 2,
    });
  });
});
