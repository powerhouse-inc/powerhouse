import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import {
  type IRelationalDb,
  type ProcessorRecord,
} from "document-drive/processors/types";
import { type DocumentModelLib } from "document-model";

export type Processors = (module: {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDb;
}) => (driveId: string) => ProcessorRecord[];

export type PHPackage = Partial<DocumentModelLib> & {
  id: string;
  name: string;
  processors?: Processors;
};
