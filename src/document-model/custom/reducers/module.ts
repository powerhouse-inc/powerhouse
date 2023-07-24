import { DocumentModelModuleOperations } from '../../gen/module/operations';
import { hashKey } from '../../../document/utils';
import { Module } from '@acaldas/document-model-graphql/document-model';

const moduleSorter = (order: string[]) => {
    const mapping: {[key:string]: number} = {};
    order.forEach((key, index) => mapping[key] = index);
    return (a: Module, b: Module) => (mapping[b.id] || 999999) - (mapping[a.id] || 999999);
}

export const reducer: DocumentModelModuleOperations = {
    addModuleOperation(state, action) {
        state.data.modules.push({
            id: hashKey(),
            name: action.input.name,
            description: action.input.description || "",
            operations: []
        });
    },

    setModuleNameOperation(state, action) {
        for (let i=0; i<state.data.modules.length; i++) {
            if (state.data.modules[i].id === action.input.id) {
                state.data.modules[i].name = action.input.name || "";
            }
        }
    },

    setModuleDescriptionOperation(state, action) {
        for (let i=0; i<state.data.modules.length; i++) {
            if (state.data.modules[i].id === action.input.id) {
                state.data.modules[i].description = action.input.description || "";
            }
        }
    },

    deleteModuleOperation(state, action) {
        state.data.modules = state.data.modules.filter(m => m.id != action.input.id);
    },

    reorderModulesOperation(state, action) {
        state.data.modules.sort(moduleSorter(action.input.order));
    },
}