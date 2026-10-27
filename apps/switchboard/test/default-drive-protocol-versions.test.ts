import type { IReactorClient } from "@powerhousedao/reactor";
import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  headNewDocument,
  selectDocumentModelModule,
  type DocumentModelModule,
  type NewDocumentHeaderOptions,
  type PHDocument,
} from "@powerhousedao/shared/document-model";

const modules = [
  driveDocumentModelModule,
  reactorDriveDocumentModelModule,
] as unknown as DocumentModelModule[];
import { describe, expect, it } from "vitest";
import { addDefaultDrive, addDefaultReactorDrive } from "../src/utils.mjs";

function client(): { client: IReactorClient; created: PHDocument[] } {
  const created: PHDocument[] = [];
  return {
    created,
    client: {
      get: () => Promise.reject(new Error("not found")),
      resolveIdOrSlug: () =>
        Promise.reject(
          Object.assign(new Error("not found"), {
            name: "DocumentNotFoundError",
          }),
        ),
      newDocument: (type: string, options?: NewDocumentHeaderOptions) =>
        Promise.resolve(
          headNewDocument(
            selectDocumentModelModule(modules, type),
            options,
            "v2-required",
            { "base-reducer": 3 },
          ),
        ),
      create: (document: PHDocument) => {
        created.push(document);
        return Promise.resolve(document);
      },
    } as unknown as IReactorClient,
  };
}

describe.each([
  ["addDefaultDrive", addDefaultDrive],
  ["addDefaultReactorDrive", addDefaultReactorDrive],
])("%s", (_name, add) => {
  it("heads the drive with the client's newDocument", async () => {
    const { client: reactor, created } = client();

    await add(reactor, { slug: "main", global: { name: "Main" } } as never, 1);

    expect(created[0].header.protocolVersions).toEqual({
      "base-reducer": 3,
      signature: 2,
    });
  });

  it("heads a drive with a configured id as legacy at the same versions", async () => {
    const { client: reactor, created } = client();

    await add(reactor, { id: "fixed", global: { name: "Main" } } as never, 1);

    expect(created[0].header.id).toBe("fixed");
    expect(created[0].header.protocolVersions).toEqual({ "base-reducer": 3 });
  });
});
