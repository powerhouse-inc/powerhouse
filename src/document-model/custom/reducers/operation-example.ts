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
        const latestSpec = state.specifications[state.specifications.length - 1];
        for (let i = 0; i < latestSpec.modules.length; i++) {
            for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
                if (
                    latestSpec.modules[i].operations[j].id ==
                    action.input.operationId
                ) {
                    latestSpec.modules[i].operations[j].examples.push({
                        id: hashKey(),
                        value: action.input.example,
                    });
                }
            }
        }
    },

    updateOperationExampleOperation(state, action) {
        const latestSpec = state.specifications[state.specifications.length - 1];
        for (let i = 0; i < latestSpec.modules.length; i++) {
            for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
                for (
                    let k = 0;
                    k < latestSpec.modules[i].operations[j].examples.length;
                    k++
                ) {
                    if (
                        latestSpec.modules[i].operations[j].examples[k].id ==
                        action.input.id
                    ) {
                        latestSpec.modules[i].operations[j].examples[k].value =
                            action.input.example;
                    }
                }
            }
        }
    },

    deleteOperationExampleOperation(state, action) {
        const latestSpec = state.specifications[state.specifications.length - 1];
        for (let i = 0; i < latestSpec.modules.length; i++) {
            for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
                latestSpec.modules[i].operations[j].examples = latestSpec.modules[
                    i
                ].operations[j].examples.filter(e => e.id != action.input.id);
            }
        }
    },

    reorderOperationExamplesOperation(state, action) {
        const latestSpec = state.specifications[state.specifications.length - 1];
        for (let i = 0; i < latestSpec.modules.length; i++) {
            for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
                if (
                    latestSpec.modules[i].operations[j].id ==
                    action.input.operationId
                ) {
                    latestSpec.modules[i].operations[j].examples.sort(
                        exampleSorter(action.input.order)
                    );
                }
            }
        }
    },
};
