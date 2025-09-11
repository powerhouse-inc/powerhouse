import { DocumentModelHeaderAction } from "./header/actions.js";
import { DocumentModelModuleAction } from "./module/actions.js";
import { DocumentModelOperationErrorAction } from "./operation-error/actions.js";
import { DocumentModelOperationExampleAction } from "./operation-example/actions.js";
import { DocumentModelOperationAction } from "./operation/actions.js";
import { DocumentModelStateAction } from "./state/actions.js";
import { DocumentModelVersioningAction } from "./versioning/actions.js";

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
