import { DocumentModelHeaderAction } from './header/actions';
import { DocumentModelModuleAction } from './modules/actions';
import { DocumentModelOperationErrorAction } from './operation-errors/actions';
import { DocumentModelOperationExampleAction } from './operation-examples/actions';
import { DocumentModelOperationAction } from './operations/actions';
import { DocumentModelStateAction } from './state/actions';

export * from './header/actions';
export * from './modules/actions';
export * from './operation-errors/actions';
export * from './operation-examples/actions';
export * from './operations/actions';
export * from './state/actions';

export type DocumentModelAction =
    | DocumentModelHeaderAction
    | DocumentModelModuleAction
    | DocumentModelOperationErrorAction
    | DocumentModelOperationExampleAction
    | DocumentModelOperationAction
    | DocumentModelStateAction;
