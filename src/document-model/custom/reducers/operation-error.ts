import { OperationError } from '@acaldas/document-model-graphql/document-model';
import { hashKey } from '../../../document/utils';
import { DocumentModelOperationErrorOperations } from '../../gen/operation-error/operations';

const errorSorter = (order: string[]) => {
    const mapping: { [key: string]: number } = {};
    order.forEach((key, index) => (mapping[key] = index));
    return (a: OperationError, b: OperationError) =>
        (mapping[b.id] || 999999) - (mapping[a.id] || 999999);
};

export const reducer: DocumentModelOperationErrorOperations = {
    addOperationErrorOperation(state, action) {
        for (let i = 0; i < state.state.modules.length; i++) {
            for (let j = 0; j < state.state.modules[i].operations.length; j++) {
                if (
                    state.state.modules[i].operations[j].id ==
                    action.input.operationId
                ) {
                    state.state.modules[i].operations[j].errors.push({
                        id: hashKey(),
                        name: action.input.errorName || '',
                        code: action.input.errorCode || '',
                        description: action.input.errorDescription || '',
                        template: action.input.errorTemplate || '',
                    });
                }
            }
        }
    },

    setOperationErrorCodeOperation(state, action) {
        for (let i = 0; i < state.state.modules.length; i++) {
            for (let j = 0; j < state.state.modules[i].operations.length; j++) {
                for (
                    let k = 0;
                    k < state.state.modules[i].operations[j].errors.length;
                    k++
                ) {
                    if (
                        state.state.modules[i].operations[j].errors[k].id ==
                        action.input.id
                    ) {
                        state.state.modules[i].operations[j].errors[k].code =
                            action.input.errorCode || '';
                    }
                }
            }
        }
    },

    setOperationErrorNameOperation(state, action) {
        for (let i = 0; i < state.state.modules.length; i++) {
            for (let j = 0; j < state.state.modules[i].operations.length; j++) {
                for (
                    let k = 0;
                    k < state.state.modules[i].operations[j].errors.length;
                    k++
                ) {
                    if (
                        state.state.modules[i].operations[j].errors[k].id ==
                        action.input.id
                    ) {
                        state.state.modules[i].operations[j].errors[k].name =
                            action.input.errorName || '';
                    }
                }
            }
        }
    },

    setOperationErrorDescriptionOperation(state, action) {
        for (let i = 0; i < state.state.modules.length; i++) {
            for (let j = 0; j < state.state.modules[i].operations.length; j++) {
                for (
                    let k = 0;
                    k < state.state.modules[i].operations[j].errors.length;
                    k++
                ) {
                    if (
                        state.state.modules[i].operations[j].errors[k].id ==
                        action.input.id
                    ) {
                        state.state.modules[i].operations[j].errors[
                            k
                        ].description = action.input.errorDescription || '';
                    }
                }
            }
        }
    },

    setOperationErrorTemplateOperation(state, action) {
        for (let i = 0; i < state.state.modules.length; i++) {
            for (let j = 0; j < state.state.modules[i].operations.length; j++) {
                for (
                    let k = 0;
                    k < state.state.modules[i].operations[j].errors.length;
                    k++
                ) {
                    if (
                        state.state.modules[i].operations[j].errors[k].id ==
                        action.input.id
                    ) {
                        state.state.modules[i].operations[j].errors[
                            k
                        ].template = action.input.errorTemplate || '';
                    }
                }
            }
        }
    },

    deleteOperationErrorOperation(state, action) {
        for (let i = 0; i < state.state.modules.length; i++) {
            for (let j = 0; j < state.state.modules[i].operations.length; j++) {
                state.state.modules[i].operations[j].errors =
                    state.state.modules[i].operations[j].errors.filter(
                        e => e.id != action.input.id
                    );
            }
        }
    },

    reorderOperationErrorsOperation(state, action) {
        for (let i = 0; i < state.state.modules.length; i++) {
            for (let j = 0; j < state.state.modules[i].operations.length; j++) {
                if (
                    state.state.modules[i].operations[j].id ==
                    action.input.operationId
                ) {
                    state.state.modules[i].operations[j].errors.sort(
                        errorSorter(action.input.order)
                    );
                }
            }
        }
    },
};
