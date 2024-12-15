import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { IDocumentDriveServer } from "document-drive";
import { DocumentDriveDocument } from "document-model-libs/document-drive";
import { IProcessor, IProcessorManager, ProcessorSetupArgs } from "./types";
import { ProcessorClass, isProcessorClass } from "./processors";
import { Knex } from "knex";

export class ProcessorManager implements IProcessorManager {
  private reactor: IDocumentDriveServer;
  private processors: IProcessor[] = [];

  constructor(
    driveServer: IDocumentDriveServer,
    private operationalStore: Knex,
  ) {
    this.reactor = driveServer;
    driveServer.on("driveAdded", this.#onDriveAdded.bind(this));
  }

  async #onDriveAdded(drive: DocumentDriveDocument) {
    await Promise.all(
      this.processors.map((module) =>
        this.reactor.addInternalListener(
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
    const drives = await this.reactor.getDrives();

    const options = processor.getOptions();
    await Promise.all(
      drives.map((drive) =>
        this.reactor.addInternalListener(
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

  async registerProcessor(module: IProcessor | ProcessorClass) {
    const args: ProcessorSetupArgs = {
      reactor: this.reactor,
      operationalStore: this.operationalStore,
    };

    const processor = isProcessorClass(module) ? new module(args) : module;
    processor.onSetup?.(args);

    await this.#onProcessorAdded(processor);
    this.processors.push(processor);
    return processor;
  }
}
