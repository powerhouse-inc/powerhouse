import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { IDocumentDriveServer, InternalTransmitterUpdate } from "document-drive";
import { DocumentDriveDocument } from "document-model-libs/document-drive";
import { OperationScope } from "document-model/document";
import { ProcessorOptions } from "src/types";
import { AnalyticsProcessor } from "./analytics-processor";

export class RWAAnalyticsProcessor extends AnalyticsProcessor {

    static OPTIONS: ProcessorOptions = {
        listenerId: "rwa-analytics-processor",
        filter: {
            branch: ["main"],
            documentId: ["*"],
            documentType: ["*"],
            scope: ["global"],
        },
        block: false,
        label: "rwa-analytics-processor",
        system: true,
    };

    constructor(protected reactor: IDocumentDriveServer, protected analyticsStore: IAnalyticsStore) {
        super(reactor, analyticsStore, RWAAnalyticsProcessor.OPTIONS);
    }

    async transmit(strands: InternalTransmitterUpdate<DocumentDriveDocument, OperationScope>[]) {
        console.log(strands.map(s => s.operations.map(o => o.type)));
        // this.analyticsStore.addSeriesValue....
        return [];
    }

    disconnect() {
        return Promise.resolve();
    }
}