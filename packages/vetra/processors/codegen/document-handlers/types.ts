import type { PowerhouseConfig } from "@powerhousedao/config";
import type { InternalTransmitterUpdate } from "document-drive";
import type { DocumentModelDocument } from "document-model";

export interface DocumentHandler {
  documentType: string;
  handle: (
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ) => Promise<void>;
}

export interface Config {
  PH_CONFIG: PowerhouseConfig;
  CURRENT_WORKING_DIR: string;
}
