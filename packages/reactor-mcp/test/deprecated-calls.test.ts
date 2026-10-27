import type {
  IReactorClient,
  InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { createReactorMcpProvider } from "@powerhousedao/reactor-mcp";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createP256Signer } from "./utils/p256-signer.js";

// IReactorClient's writes that warn "is deprecated"; client.write replaces them.
const DEPRECATED = new Set([
  "create",
  "createEmpty",
  "createDocumentInDrive",
  "execute",
  "executeBatch",
  "rename",
  "setPreferredEditor",
  "addRelationship",
  "removeRelationship",
  "deleteDocument",
  "deleteDocuments",
]);

/** The client, refusing its deprecated writes. */
function withoutDeprecatedWrites(client: IReactorClient): IReactorClient {
  return new Proxy(client, {
    get(target, key, receiver) {
      if (typeof key === "string" && DEPRECATED.has(key)) {
        throw new Error(`reactor-mcp called IReactorClient.${key}`);
      }
      return Reflect.get(target, key, receiver);
    },
  });
}

describe("reactor-mcp's writes", () => {
  let module: InProcessReactorClientModule;

  beforeEach(async () => {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule,
          driveDocumentModelModule,
        ]),
      )
      .withSigner(await createP256Signer())
      .buildModule();
  });

  afterEach(() => {
    module.reactor.kill();
  });

  it("use no deprecated IReactorClient write", async () => {
    const { tools } = await createReactorMcpProvider({
      client: withoutDeprecatedWrites(module.client),
    });
    const content = (result: {
      structuredContent?: unknown;
      isError?: boolean;
    }) => {
      expect(result.isError).toBeUndefined();
      return result.structuredContent as Record<string, string>;
    };

    const { driveId } = content(
      await tools.addDrive.callback({
        name: "Books",
        icon: "book",
        preferredEditor: "powerhouse/generic-drive-explorer",
      }),
    );
    const { documentId } = content(
      await tools.createDocument.callback({
        documentType: "powerhouse/document-model",
      }),
    );
    await tools.createDocument.callback({
      documentType: "powerhouse/document-model",
      driveId,
    });
    content(
      await tools.addActions.callback({
        documentId,
        actions: [
          { type: "SET_MODEL_NAME", input: { name: "Books" }, scope: "global" },
        ],
      }),
    );

    expect(
      content(await tools.deleteDocument.callback({ documentId })),
    ).toEqual({ success: true });
    expect(
      content(await tools.deleteDrive.callback({ documentId: driveId })),
    ).toEqual({ success: true });
    const drive = await module.client.get(driveId).catch(() => undefined);
    expect(drive).toBeUndefined();
  });
});
