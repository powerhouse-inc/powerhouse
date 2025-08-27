import type { DocumentModelHeaderAction } from "./header/actions.js";
import type { DocumentModelModuleAction } from "./module/actions.js";
import type { DocumentModelOperationErrorAction } from "./operation-error/actions.js";
import type { DocumentModelOperationExampleAction } from "./operation-example/actions.js";
import type { DocumentModelOperationAction } from "./operation/actions.js";
import type { DocumentModelStateAction } from "./state/actions.js";
import type { DocumentModelVersioningAction } from "./versioning/actions.js";

export * from "./header/actions.js";
export * from "./module/actions.js";
export * from "./operation-error/actions.js";
export * from "./operation-example/actions.js";
export * from "./operation/actions.js";
export * from "./state/actions.js";
export * from "./versioning/actions.js";

export type DocumentModelAction =
  | DocumentModelHeaderAction
  | DocumentModelVersioningAction
  | DocumentModelModuleAction
  | DocumentModelOperationErrorAction
  | DocumentModelOperationExampleAction
  | DocumentModelOperationAction
  | DocumentModelStateAction;
