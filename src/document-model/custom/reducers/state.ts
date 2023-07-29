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
        const latestSpec = state.specifications[state.specifications.length - 1];
        latestSpec.state.schema = action.input.schema;
    },

    setInitialStateOperation(state, action) {
        const latestSpec = state.specifications[state.specifications.length - 1];
        latestSpec.state.initialValue = action.input.initialValue;
    },

    addStateExampleOperation(state, action) {
        const latestSpec = state.specifications[state.specifications.length - 1];
        latestSpec.state.examples.push({
            id: hashKey(),
            value: action.input.example,
        });
    },

    updateStateExampleOperation(state, action) {
        const latestSpec = state.specifications[state.specifications.length - 1];
        for (let i = 0; i < latestSpec.state.examples.length; i++) {
            if (latestSpec.state.examples[i].id == action.input.id) {
                latestSpec.state.examples[i].value = action.input.newExample;
            }
        }
    },

    deleteStateExampleOperation(state, action) {
        const latestSpec = state.specifications[state.specifications.length - 1];
        latestSpec.state.examples = latestSpec.state.examples.filter(
            e => e.id != action.input.id
        );
    },

    reorderStateExamplesOperation(state, action) {
        const latestSpec = state.specifications[state.specifications.length - 1];
        latestSpec.state.examples.sort(exampleSorter(action.input.order));
    },
};
