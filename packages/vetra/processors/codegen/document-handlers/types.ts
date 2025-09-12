import type { PowerhouseConfig } from "@powerhousedao/config";
import type { InternalTransmitterUpdate } from "document-drive";

export interface DocumentHandler {
  documentType: string;
  handle: (strand: InternalTransmitterUpdate) => Promise<void>;
}

export interface Config {
  PH_CONFIG: PowerhouseConfig;
  CURRENT_WORKING_DIR: string;
}
