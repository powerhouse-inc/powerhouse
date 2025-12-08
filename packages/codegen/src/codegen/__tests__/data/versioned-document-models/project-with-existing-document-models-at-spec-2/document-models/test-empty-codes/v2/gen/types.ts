import type { PHDocument, PHBaseState } from "document-model";
import type { TestEmptyCodesAction } from "./actions.js";
import type { TestEmptyCodesState as TestEmptyCodesGlobalState } from "./schema/types.js";

type TestEmptyCodesLocalState = Record<PropertyKey, never>;

type TestEmptyCodesPHState = PHBaseState & {
  global: TestEmptyCodesGlobalState;
  local: TestEmptyCodesLocalState;
};
type TestEmptyCodesDocument = PHDocument<TestEmptyCodesPHState>;

export * from "./schema/types.js";

export type {
  TestEmptyCodesGlobalState,
  TestEmptyCodesLocalState,
  TestEmptyCodesPHState,
  TestEmptyCodesAction,
  TestEmptyCodesDocument,
};
