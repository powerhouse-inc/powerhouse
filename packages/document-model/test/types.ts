import type { PHBaseState } from "@powerhousedao/shared/document-model";

export type TestPHState = PHBaseState & {
  global: any;
  local: any;
};
