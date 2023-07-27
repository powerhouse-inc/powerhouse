import { CodeExample } from '@acaldas/document-model-graphql/document-model';
import { hashKey } from '../../../document/utils';
import { DocumentModelStateOperations } from '../../gen/state/operations';

const exampleSorter = (order: string[]) => {
    const mapping: { [key: string]: number } = {};
    order.forEach((key, index) => (mapping[key] = index));
    return (a: CodeExample, b: CodeExample) =>
        (mapping[b.id] || 999999) - (mapping[a.id] || 999999);
};

export const reducer: DocumentModelStateOperations = {
    setStateSchemaOperation(state, action) {
        state.state.schema = action.input.schema;
    },

    addStateExampleOperation(state, action) {
        state.state.examples.push({
            id: hashKey(),
            value: action.input.example,
        });
    },

    updateStateExampleOperation(state, action) {
        for (let i = 0; i < state.state.examples.length; i++) {
            if (state.state.examples[i].id == action.input.id) {
                state.state.examples[i].value = action.input.newExample;
            }
        }
    },

    deleteStateExampleOperation(state, action) {
        state.state.examples = state.state.examples.filter(
            e => e.id != action.input.id
        );
    },

    reorderStateExamplesOperation(state, action) {
        state.state.examples.sort(exampleSorter(action.input.order));
    },
};
