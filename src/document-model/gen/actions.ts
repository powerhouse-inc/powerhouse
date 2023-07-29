import { DocumentModelHeaderAction } from './header/actions';
import { DocumentModelVersioningAction } from './versioning/actions';
import { DocumentModelModuleAction } from './module/actions';
import { DocumentModelOperationErrorAction } from './operation-error/actions';
import { DocumentModelOperationExampleAction } from './operation-example/actions';
import { DocumentModelOperationAction } from './operation/actions';
import { DocumentModelStateAction } from './state/actions';

export * from './header/actions';
export * from './versioning/actions';
export * from './module/actions';
export * from './operation-error/actions';
export * from './operation-example/actions';
export * from './operation/actions';
export * from './state/actions';

export type DocumentModelAction =
    | DocumentModelHeaderAction
    | DocumentModelVersioningAction
    | DocumentModelModuleAction
    | DocumentModelOperationErrorAction
    | DocumentModelOperationExampleAction
    | DocumentModelOperationAction
    | DocumentModelStateAction
;