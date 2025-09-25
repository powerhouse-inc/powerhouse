import type { PHBaseState } from "document-model";

export type TestPHState = PHBaseState & {
  global: any;
  local: any;
};
