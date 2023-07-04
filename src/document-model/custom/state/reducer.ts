import { CodeExample } from '@acaldas/document-model-graphql/document-model';
import { hashKey } from '../../../document/utils';
import { DocumentModelStateOperations } from '../../gen/state/operations';

const exampleSorter = (order: string[]) => {
    const mapping: {[key:string]: number} = {};
    order.forEach((key, index) => mapping[key] = index);
    return (a: CodeExample, b: CodeExample) => (mapping[a.id] || 999999) - (mapping[b.id] || 999999);
}

export const reducer: DocumentModelStateOperations = {
    setStateSchemaOperation(state, action) {
        state.data.state.schema = action.input.schema;
    },

    addStateExampleOperation(state, action) {
        state.data.state.examples.push({
            id: hashKey(),
            value: action.input.example
        });
    },

    updateStateExampleOperation(state, action) {
        for(let i=0; i<state.data.state.examples.length; i++) {
            if (state.data.state.examples[i].id == action.input.id) {
                state.data.state.examples[i].value = action.input.newExample;
            }
        }
    },

    deleteStateExampleOperation(state, action) {
        state.data.state.examples =
            state.data.state.examples.filter(e => e.id != action.input.id); 
    },

    reorderStateExamplesOperation(state, action) {
        state.data.state.examples.sort(exampleSorter(action.input.order));
    },
}