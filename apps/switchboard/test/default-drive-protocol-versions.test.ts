import type { IReactorClient } from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { addDefaultDrive, addDefaultReactorDrive } from "../src/utils.mjs";

function client(): { client: IReactorClient; created: PHDocument[] } {
  const created: PHDocument[] = [];
  return {
    created,
    client: {
      get: () => Promise.reject(new Error("not found")),
      getCreateSignaturePolicy: () => Promise.resolve("v2-required"),
      getCreateProtocolVersions: () => Promise.resolve({ "base-reducer": 3 }),
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
  it("heads the drive at the client's create versions", async () => {
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
