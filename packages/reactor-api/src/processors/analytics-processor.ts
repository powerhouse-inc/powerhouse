import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { IDocumentDriveServer } from "document-drive";
import { Document, OperationScope } from "document-model/document";
import { Processor } from "./processor";

export abstract class AnalyticsProcessor<
  D extends Document = Document,
  S extends OperationScope = OperationScope,
> extends Processor<D, S> {
  constructor(
    protected reactor: IDocumentDriveServer,
    protected analyticsStore: IAnalyticsStore,
  ) {
    super(reactor);
  }
}
