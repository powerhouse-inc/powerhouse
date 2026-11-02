import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  IReactorClient,
  InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";
import { createP256Signer } from "./utils/p256-signer.js";

// IReactorClient's writes that warn "is deprecated"; client.write replaces them.
const DEPRECATED = new Set([
  "create",
  "createEmpty",
  "upgradeDocument",
  "createDocumentInDrive",
  "execute",
  "executeBatch",
  "rename",
  "setPreferredEditor",
  "addRelationship",
  "updateRelationship",
  "removeRelationship",
  "moveRelationship",
  "deleteDocument",
  "deleteDocuments",
  "loadBatch",
  // The facade's drive writes; client.write.drives replaces them.
  "drives",
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
          documentModelDocumentModelModule as unknown as DocumentModelModule,
          driveDocumentModelModule as unknown as DocumentModelModule,
        ]),
      )
      .withSigner(await createP256Signer())
      .buildModule();
  });

  afterEach(() => {
    module.reactor.kill();
  });

  it("use no deprecated IReactorClient write", async () => {
    const server = await createServer({
      client: withoutDeprecatedWrites(module.client),
    });
    const mcp = new Client({ name: "test", version: "1.0.0" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), mcp.connect(clientSide)]);
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await mcp.callTool({ name, arguments: args });
      expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
      return result.structuredContent as Record<string, string>;
    };
    let driveId = "";
    try {
      ({ driveId } = await call("addDrive", {
        name: "Books",
        icon: "book",
        preferredEditor: "powerhouse/generic-drive-explorer",
      }));
      const { documentId } = await call("createDocument", {
        documentType: "powerhouse/document-model",
        name: "Loose",
      });
      const filed = await call("createDocument", {
        documentType: "powerhouse/document-model",
        driveId,
        name: "Filed",
      });
      await call("addActions", {
        documentId,
        actions: [{ type: "SET_MODEL_NAME", input: { name: "Books" } }],
      });
      await call("deleteDocument", { documentId: filed.documentId });
      await call("deleteDocument", { documentId });
      await call("deleteDrive", { documentId: driveId });
    } finally {
      await mcp.close();
      await server.close();
    }
    await expect(module.client.read.get(driveId)).rejects.toThrow();
  });
});
