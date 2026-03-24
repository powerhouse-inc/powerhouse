import type {
    PHBaseState,
    PHDocument,
} from "document-model";
import type { TestDocAction } from "./actions.js";
import type { TestDocState as TestDocGlobalState } from "./schema/types.js";

type TestDocLocalState = Record<PropertyKey, never>;

type TestDocPHState = PHBaseState & {
  global: TestDocGlobalState;
  local: TestDocLocalState;
};
type TestDocDocument = PHDocument<TestDocPHState>;

export * from "./schema/types.js";

export type {
    TestDocAction,
    TestDocDocument, TestDocGlobalState,
    TestDocLocalState,
    TestDocPHState
};

