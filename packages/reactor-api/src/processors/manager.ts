import { DocumentDriveDocument, IDocumentDriveServer } from "document-drive";

import { IAnalyticsStore } from "#processors/analytics-processor.js";
import { isProcessorClass, ProcessorClass } from "#processors/processor.js";
import {
  Db,
  IProcessor,
  IProcessorManager,
  ProcessorSetupArgs,
} from "#types.js";

export class ProcessorManager implements IProcessorManager {
  private reactor: IDocumentDriveServer;
  private processors: IProcessor[] = [];

  constructor(
    driveServer: IDocumentDriveServer,
    private operationalStore: Db,
    private analyticsStore: IAnalyticsStore,
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

    console.log(`> Registered ${options.label} processor.`);
  }

  async registerProcessor(module: IProcessor | ProcessorClass) {
    const args: ProcessorSetupArgs = {
      reactor: this.reactor,
      operationalStore: this.operationalStore,
      analyticsStore: this.analyticsStore,
    };

    const processor = isProcessorClass(module) ? new module(args) : module;
    processor.onSetup?.(args);

    await this.#onProcessorAdded(processor);
    this.processors.push(processor);
    return processor;
  }
}
