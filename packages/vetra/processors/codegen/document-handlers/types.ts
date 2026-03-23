import type { PowerhouseConfig } from "@powerhousedao/config";

export type CodegenInput = {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  state?: unknown;
};

export interface DocumentHandler {
  documentType: string;
  handle: (input: CodegenInput) => Promise<void>;
}

export interface Config {
  PH_CONFIG: PowerhouseConfig;
  CURRENT_WORKING_DIR: string;
}
