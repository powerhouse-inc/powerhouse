---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/index.ts"
force: true
---
import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { ProcessorOptions } from "@powerhousedao/reactor-api";
import { AnalyticsProcessor } from "@powerhousedao/reactor-api";
import { IDocumentDriveServer, InternalTransmitterUpdate } from "document-drive";
import { DocumentDriveDocument } from "document-model-libs/document-drive";
import { OperationScope } from "document-model/document";

export class RWAAnalyticsProcessor extends AnalyticsProcessor {

    static ANALYTICS_PROCESSOR_OPTIONS: ProcessorOptions = {
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
        super(reactor, analyticsStore, RWAAnalyticsProcessor.ANALYTICS_PROCESSOR_OPTIONS);
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