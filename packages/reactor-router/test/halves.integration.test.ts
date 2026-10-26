import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import {
  actions,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRoutingClient,
  fromReactorClient,
  type RoutableBackendConfig,
  type RoutingReactorClient,
} from "../src/index.js";
import { IN_PROCESS, memoryInfo, silent } from "./stubs.js";

async function inProcessReactor(): Promise<InProcessReactorClientModule> {
  const builder = new ReactorBuilder().withDocumentModelSources([
    driveDocumentModelModule as unknown as DocumentModelModule,
    documentModelDocumentModelModule,
  ]);
  return new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .withCreateSignaturePolicy("legacy")
    .buildModule();
}

describe("routing halves over real in-process reactors", () => {
  let alpha: InProcessReactorClientModule;
  let beta: InProcessReactorClientModule;
  let client: RoutingReactorClient;
  let driveA = "";
  let driveB = "";

  beforeAll(async () => {
    alpha = await inProcessReactor();
    beta = await inProcessReactor();
    driveA = (await alpha.client.drives.create({ global: { name: "Alpha" } }))
      .header.id;
    driveB = (await beta.client.drives.create({ global: { name: "Beta" } }))
      .header.id;
    // Beta is reached without halves: its writes go through submit.
    const {
      read: _read,
      write: _write,
      ...submitOnly
    } = fromReactorClient(beta.client);
    const backends: RoutableBackendConfig[] = [
      {
        name: "alpha",
        backend: fromReactorClient(alpha.client),
        facts: memoryInfo(),
        reach: IN_PROCESS,
        refusesMisroutes: false,
      },
      {
        name: "beta",
        backend: submitOnly,
        facts: memoryInfo(),
        reach: IN_PROCESS,
        refusesMisroutes: false,
      },
    ];
    client = await createRoutingClient(backends, { onDiagnostic: silent });
  });

  afterAll(async () => {
    await alpha.reactor.kill().completed;
    await beta.reactor.kill().completed;
  });

  it("hands back the holder's own handle, whose token bounds a routed read", async () => {
    const handle = await client.write.execute(driveA, "main", [
      actions.setName("alpha renamed"),
    ]);

    const receipt = await handle.written;
    const drive = await client.read.get<DocumentDriveDocument>(
      receipt.documentId,
      undefined,
      undefined,
      receipt.token,
    );

    expect(receipt.token.coordinates.length).toBeGreaterThan(0);
    expect(drive.header.name).toBe("alpha renamed");
  });

  it("builds a handle from a submit-only backend's job and reads it back", async () => {
    const handle = await client.write.execute(driveB, "main", [
      actions.setName("beta renamed"),
    ]);

    const written = await handle.written;
    const readable = await handle.readable;
    const drive = await handle.document<DocumentDriveDocument>();

    expect(handle.jobId).not.toBe("");
    expect(written.token.coordinates.length).toBeGreaterThan(0);
    expect(readable.job.status).toBe("READ_READY");
    expect(drive.header.name).toBe("beta renamed");
  });

  it("adds a folder through the drive write half and reads it back", async () => {
    const handle = await client.write.drives.addFolder(driveB, "routed");

    await handle.readable;
    const node = await client.read.drives.getNode(driveB, handle.nodeId);

    expect(node.name).toBe("routed");
  });
});
