import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { IBaseDocumentDriveServer } from "document-drive";
import { ProcessorType } from "src/types";
import { AnalyticsProcessor, Processor } from "./analytics-processor";

export class ProcessorFactory {

    private readonly reactor: IBaseDocumentDriveServer;
    private readonly analyticsStore: IAnalyticsStore;

    constructor(reactor: IBaseDocumentDriveServer, analyticsStore: IAnalyticsStore) {
        this.reactor = reactor;
        this.analyticsStore = analyticsStore;
    }

    create(processor: ProcessorType<Processor | AnalyticsProcessor>) {
        // @ts-ignore
        console.log("processor", processor.RWAAnalyticsProcessor);
        // @ts-ignore
        return new processor.RWAAnalyticsProcessor(this.reactor, this.analyticsStore);
    }
}