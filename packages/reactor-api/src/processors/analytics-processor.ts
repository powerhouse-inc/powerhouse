import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { IBaseDocumentDriveServer, IDocumentDriveServer, InternalTransmitterUpdate, ITransmitter } from "document-drive";
import { ListenerFilter } from "document-model-libs/document-drive";
import { Document, OperationScope } from "document-model/document";
import { ProcessorOptions } from "src/types";

export abstract class Processor implements ITransmitter {

    static TYPE = "processor";

    private processorOptions: ProcessorOptions = {
        listenerId: "processor",
        filter: {
            branch: ["main"],
            documentId: ["*"],
            documentType: ["*"],
            scope: ["global"],
        },
        block: false,
        label: "processor",
        system: true,
    };

    constructor(protected reactor: IBaseDocumentDriveServer, options?: ProcessorOptions) {
        options && (this.processorOptions = options);
        this.#registerProcessor();
    }

    async #registerProcessor() {
        const drives = await this.reactor.getDrives();
        for (const drive of drives) {
            const transmitter = await this.reactor.getTransmitter(drive, this.processorOptions.listenerId);
            if (transmitter) continue;
            await this.reactor.addInternalListener(drive, this, this.processorOptions);
        }
    }

    async transmit(strands: InternalTransmitterUpdate<Document, OperationScope>[]) {
        console.log(strands.map(s => s.operations.map(o => o.type)));
        return [];
    }

    disconnect() {
        return Promise.resolve();
    }

    getOptions() {
        return this.processorOptions;
    }

}

export class AnalyticsProcessor extends Processor {

    static TYPE = "analytics-processor";

    constructor(protected reactor: IDocumentDriveServer, protected analyticsStore: IAnalyticsStore, options?: ProcessorOptions) {
        super(reactor, options);
    }
}

