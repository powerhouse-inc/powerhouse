import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { IDocumentDriveServer } from "document-drive";
import { DocumentDriveDocument } from "document-model-libs/document-drive";
import { IProcessor, ProcessorSetupArgs } from "./types";

export class ProcessorManager {
  private driveServer: IDocumentDriveServer;
  private modules: IProcessor[] = [];

  constructor(
    driveServer: IDocumentDriveServer,
    private analyticsStore: IAnalyticsStore,
  ) {
    this.driveServer = driveServer;
    driveServer.on("driveAdded", this.#onDriveAdded.bind(this));
  }

  async #onDriveAdded(drive: DocumentDriveDocument) {
    await Promise.all(
      this.modules.map((module) =>
        this.driveServer.addInternalListener(
          drive.state.global.id,
          {
            onStrands: (strands) => module.onStrands(strands),
            onDisconnect: () => module.onDisconnect(),
          },
          { ...module.getOptions() },
        ),
      ),
    );
  }

  async #onProcessorAdded(processor: IProcessor) {
    const drives = await this.driveServer.getDrives();
    const options = processor.getOptions();
    await Promise.all(
      drives.map((drive) =>
        this.driveServer.addInternalListener(
          drive,
          {
            onStrands: (strands) => processor.onStrands(strands),
            onDisconnect: () => processor.onDisconnect(),
          },
          options,
        ),
      ),
    );
  }

  async registerProcessor(module: IProcessor) {
    // @ts-ignore
    module.onSetup({
      reactor: this.driveServer,
      analyticsStore: this.analyticsStore,
    } as ProcessorSetupArgs);

    this.#onProcessorAdded(module);
    this.modules.push(module);
  }
}
