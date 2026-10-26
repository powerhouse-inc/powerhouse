import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { InProcessReactorClientModule } from "../../src/core/types.js";
import {
  createReactorHostModuleBase,
  type IReactorProcessorHostModuleBase,
  type ReactorHostModuleBaseOptions,
} from "../../src/processors/host-module.js";
import { JobStatus } from "../../src/shared/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";

describe("host module dispatch over the write half", () => {
  let module: InProcessReactorClientModule;
  let hostModule: IReactorProcessorHostModuleBase;

  beforeEach(async () => {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          driveDocumentModelModule as never,
          documentModelDocumentModelModule,
        ]),
      )
      .withSigner((await TestP256Signer.create()).asISigner())
      .buildModule();
    hostModule = createReactorHostModuleBase({
      client: module.client,
      readModels: [],
      relationalDb: {} as ReactorHostModuleBaseOptions["relationalDb"],
      analyticsStore: {} as ReactorHostModuleBaseOptions["analyticsStore"],
      processorApp: "switchboard",
    });
  });

  afterEach(() => {
    module.reactor.kill();
  });

  it("builds the module with both halves and the facade over them", () => {
    expect(module.read).toBe(module.client.read);
    expect(module.write).toBe(module.client.write);
    expect(hostModule.read).toBe(module.read);
  });

  it("creates a document in a drive and answers with the job and the new id", async () => {
    const drive = await module.client.drives.create({
      global: { name: "Dispatch drive" },
    });
    const document = documentModelDocumentModelModule.utils.createDocument();

    const result = await hostModule.dispatch.createInDrive(
      drive.header.id,
      document,
    );

    expect(result.documentId).toBe(document.header.id);
    expect(result.id).toBeTruthy();
    expect(Object.values(JobStatus)).toContain(result.status);

    await module.client.waitForJob(result.id);
    const created = await hostModule.read.get(document.header.id);
    expect(created.header.id).toBe(document.header.id);
    await expect
      .poll(async () => {
        const updated = await hostModule.read.get<DocumentDriveDocument>(
          drive.header.id,
        );
        return updated.state.global.nodes.map((node) => node.id);
      })
      .toContain(document.header.id);
  });

  it("deletes a document and answers with the delete job", async () => {
    const created = await module.client.createEmpty(
      documentModelDocumentModelModule.documentModel.global.id,
    );

    const result = await hostModule.dispatch.deleteDocument(created.header.id);
    expect(result.id).toBeTruthy();

    const settled = await module.client.waitForJob(result.id);
    expect(settled.status).toBe(JobStatus.READ_READY);
    await expect(hostModule.read.get(created.header.id)).rejects.toThrow();
  });
});
