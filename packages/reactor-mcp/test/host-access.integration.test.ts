import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { InProcessReactorClientModule } from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type McpAccess } from "../src/index.js";
import { createP256Signer } from "./utils/p256-signer.js";

// A host ACL as a table: what the caller may read, write and execute.
class Acl implements McpAccess {
  unrestricted = false;
  authenticated = true;
  readonly readable = new Set<string>();
  readonly writable = new Set<string>();
  readonly deniedTypes = new Set<string>();
  creates = true;
  readonly createdIds: string[] = [];

  canRead(id: string) {
    return Promise.resolve(this.readable.has(id) || this.writable.has(id));
  }
  canWrite(id: string) {
    return Promise.resolve(this.writable.has(id));
  }
  canMutate(id: string, type: string) {
    return Promise.resolve(
      this.writable.has(id) && !this.deniedTypes.has(type),
    );
  }
  canCreate() {
    return this.creates;
  }
  // Like the host's owner record: the creator may then read and write it.
  created(id: string) {
    this.createdIds.push(id);
    this.writable.add(id);
    return Promise.resolve();
  }
}

type Result = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: unknown;
};

describe("MCP tools behind the host's ACL", () => {
  let module: InProcessReactorClientModule;
  let close: (() => Promise<void>) | undefined;

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

  afterEach(async () => {
    await close?.();
    close = undefined;
    module.reactor.kill();
  });

  async function connect(access?: McpAccess) {
    const server = await createServer({ client: module.client, access });
    const mcp = new Client({ name: "test", version: "1.0.0" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), mcp.connect(clientSide)]);
    close = async () => {
      await mcp.close();
      await server.close();
    };
    return (name: string, args: Record<string, unknown> = {}) =>
      mcp.callTool({ name, arguments: args }) as Promise<Result>;
  }

  const errorText = (result: Result) =>
    JSON.stringify(result.content ?? "") as string;

  // A drive holding one document, made by the host itself.
  async function fixture() {
    const call = await connect();
    const ok = async (name: string, args: Record<string, unknown>) => {
      const result = await call(name, args);
      expect(result.isError, errorText(result)).toBeFalsy();
      return result.structuredContent as Record<string, string>;
    };
    const { driveId } = await ok("addDrive", { name: "Shared" });
    const { documentId } = await ok("createDocument", {
      documentType: "powerhouse/document-model",
      driveId,
      name: "Filed",
    });
    const { documentId: other } = await ok("createDocument", {
      documentType: "powerhouse/document-model",
      name: "Other",
    });
    await close?.();
    return { driveId, documentId, other };
  }

  const driveNodes = async (driveId: string) =>
    (
      (await module.client.read.get(driveId)).state as unknown as {
        global: { nodes: { id: string }[] };
      }
    ).global.nodes.map((node) => node.id);

  it("refuses reads the ACL refuses, as FORBIDDEN even for an unknown id", async () => {
    const { documentId } = await fixture();
    const acl = new Acl();
    const call = await connect(acl);

    const refused = await call("getDocument", { documentId });
    expect(refused.isError).toBe(true);
    expect(errorText(refused)).toContain("FORBIDDEN");
    const unknown = await call("getDocument", { documentId: "missing" });
    expect(errorText(unknown)).toContain("FORBIDDEN");

    acl.readable.add(documentId);
    const read = await call("getDocument", { documentId });
    expect(read.isError, errorText(read)).toBeFalsy();
  });

  it("answers an unknown id NOT_FOUND to an unrestricted caller", async () => {
    const acl = new Acl();
    acl.unrestricted = true;
    const call = await connect(acl);

    expect(
      errorText(await call("getDocument", { documentId: "missing" })),
    ).toContain("NOT_FOUND");
  });

  it("drops the drives and children the ACL refuses from listings", async () => {
    const { driveId, documentId } = await fixture();
    const acl = new Acl();
    const call = await connect(acl);
    const ids = (result: Result, key: string) =>
      (
        (result.structuredContent as Record<string, { id: string }[]>)[key] ??
        []
      ).map((d) => d.id);

    expect(ids(await call("getDrives"), "drives")).toEqual([]);
    acl.readable.add(driveId);
    expect(ids(await call("getDrives"), "drives")).toEqual([driveId]);
    expect(ids(await call("getDocuments", { driveId }), "documents")).toEqual(
      [],
    );
    acl.readable.add(documentId);
    expect(ids(await call("getDocuments", { driveId }), "documents")).toEqual([
      documentId,
    ]);
  });

  it("refuses a batch with an action type the ACL denies, writing none of it", async () => {
    const { other } = await fixture();
    const acl = new Acl();
    acl.writable.add(other);
    acl.deniedTypes.add("SET_MODEL_ID");
    const call = await connect(acl);
    const before = (await module.client.read.get(other)).header.revision;

    const result = await call("addActions", {
      documentId: other,
      actions: [
        { type: "SET_MODEL_NAME", input: { name: "Kept out" } },
        { type: "SET_MODEL_ID", input: { id: "kept/out" } },
      ],
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      success: false,
      results: [
        { index: 0, error: { kind: "not-applied" } },
        { index: 1, error: { kind: "denied" } },
      ],
    });
    expect((await module.client.read.get(other)).header.revision).toEqual(
      before,
    );

    acl.deniedTypes.clear();
    const applied = await call("addActions", {
      documentId: other,
      actions: [{ type: "SET_MODEL_NAME", input: { name: "Let in" } }],
    });
    expect(applied.structuredContent).toMatchObject({ success: true });
  });

  it("creates only where GraphQL would: canCreate, or write on the drive", async () => {
    const { driveId } = await fixture();
    const acl = new Acl();
    acl.creates = false;
    acl.authenticated = false;
    const call = await connect(acl);
    const create = (args: Record<string, unknown> = {}) =>
      call("createDocument", {
        documentType: "powerhouse/document-model",
        ...args,
      });

    const loose = await create();
    expect(errorText(loose)).toContain("Authentication required");
    expect(errorText(await create({ driveId }))).toContain("FORBIDDEN");

    acl.writable.add(driveId);
    const filed = await create({ driveId, name: "Mine" });
    expect(filed.isError, errorText(filed)).toBeFalsy();
    const { documentId } = filed.structuredContent as { documentId: string };
    expect(acl.createdIds).toEqual([documentId]);
    expect(await driveNodes(driveId)).toContain(documentId);
  });

  it("deletes only with write on the document and DELETE_NODE on its drive", async () => {
    const { driveId, documentId } = await fixture();
    const acl = new Acl();
    acl.readable.add(documentId);
    const call = await connect(acl);

    const refused = await call("deleteDocument", { documentId });
    expect(errorText(refused)).toContain("FORBIDDEN");

    acl.writable.add(documentId);
    acl.readable.add(driveId);
    const unfiled = await call("deleteDocument", { documentId });
    expect(errorText(unfiled)).toContain(`filed in drive ${driveId}`);
    expect(await driveNodes(driveId)).toContain(documentId);

    acl.writable.add(driveId);
    const deleted = await call("deleteDocument", { documentId });
    expect(deleted.isError, errorText(deleted)).toBeFalsy();
    expect(await driveNodes(driveId)).not.toContain(documentId);
  });

  it("gates addDrive on canCreate and deleteDrive on write", async () => {
    const { driveId } = await fixture();
    const acl = new Acl();
    acl.creates = false;
    const call = await connect(acl);

    expect(errorText(await call("addDrive", { name: "No" }))).toContain(
      "you may not create documents",
    );
    expect(
      errorText(await call("deleteDrive", { documentId: driveId })),
    ).toContain("FORBIDDEN");

    acl.creates = true;
    const added = await call("addDrive", { name: "Mine" });
    expect(added.isError, errorText(added)).toBeFalsy();
    const mine = (added.structuredContent as { driveId: string }).driveId;
    expect(acl.createdIds).toEqual([mine]);
    const drive: PHDocument = await module.client.read.get(mine);
    expect(drive.header.name).toBe("Mine");

    const removed = await call("deleteDrive", { documentId: mine });
    expect(removed.isError, errorText(removed)).toBeFalsy();
  });
});
