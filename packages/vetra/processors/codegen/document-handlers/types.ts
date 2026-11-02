import type { PowerhouseConfig } from "@powerhousedao/config";

export type CodegenInput = {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  state?: unknown;
};

/** What a generator reports while it runs, for the document's codegen status. */
export interface CodegenJob {
  /** The job waits for, or runs, a dependency install. */
  waitingForInstall(message: string): void;
  /** The job generates again after an install. */
  running(): void;
}

/** A generator that decided not to generate says why. */
export type GenerateResult = { skipped: string } | void;

export interface DocumentHandler {
  documentType: string;
  handle: (input: CodegenInput) => Promise<void>;
}

export interface Config {
  PH_CONFIG: PowerhouseConfig;
  CURRENT_WORKING_DIR: string;
}
