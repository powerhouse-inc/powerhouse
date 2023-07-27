import { CodeExample } from '@acaldas/document-model-graphql/document-model';
import { hashKey } from '../../../document/utils';
import { DocumentModelOperationExampleOperations } from '../../gen/operation-example/operations';

const exampleSorter = (order: string[]) => {
    const mapping: { [key: string]: number } = {};
    order.forEach((key, index) => (mapping[key] = index));
    return (a: CodeExample, b: CodeExample) =>
        (mapping[b.id] || 999999) - (mapping[a.id] || 999999);
};

export const reducer: DocumentModelOperationExampleOperations = {
    addOperationExampleOperation(state, action) {
        for (let i = 0; i < state.modules.length; i++) {
            for (let j = 0; j < state.modules[i].operations.length; j++) {
                if (
                    state.modules[i].operations[j].id ==
                    action.input.operationId
                ) {
                    state.modules[i].operations[j].examples.push({
                        id: hashKey(),
                        value: action.input.example,
                    });
                }
            }
        }
    },

    updateOperationExampleOperation(state, action) {
        for (let i = 0; i < state.modules.length; i++) {
            for (let j = 0; j < state.modules[i].operations.length; j++) {
                for (
                    let k = 0;
                    k < state.modules[i].operations[j].examples.length;
                    k++
                ) {
                    if (
                        state.modules[i].operations[j].examples[k].id ==
                        action.input.id
                    ) {
                        state.modules[i].operations[j].examples[k].value =
                            action.input.example;
                    }
                }
            }
        }
    },

    deleteOperationExampleOperation(state, action) {
        for (let i = 0; i < state.modules.length; i++) {
            for (let j = 0; j < state.modules[i].operations.length; j++) {
                state.modules[i].operations[j].examples = state.modules[
                    i
                ].operations[j].examples.filter(e => e.id != action.input.id);
            }
        }
    },

    reorderOperationExamplesOperation(state, action) {
        for (let i = 0; i < state.modules.length; i++) {
            for (let j = 0; j < state.modules[i].operations.length; j++) {
                if (
                    state.modules[i].operations[j].id ==
                    action.input.operationId
                ) {
                    state.modules[i].operations[j].examples.sort(
                        exampleSorter(action.input.order)
                    );
                }
            }
        }
    },
};
