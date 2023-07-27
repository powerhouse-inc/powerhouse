import { Module } from '@acaldas/document-model-graphql/document-model';
import { hashKey } from '../../../document/utils';
import { DocumentModelModuleOperations } from '../../gen/module/operations';

const moduleSorter = (order: string[]) => {
    const mapping: { [key: string]: number } = {};
    order.forEach((key, index) => (mapping[key] = index));
    return (a: Module, b: Module) =>
        (mapping[b.id] || 999999) - (mapping[a.id] || 999999);
};

export const reducer: DocumentModelModuleOperations = {
    addModuleOperation(state, action) {
        state.modules.push({
            id: hashKey(),
            name: action.input.name,
            description: action.input.description || '',
            operations: [],
        });
    },

    setModuleNameOperation(state, action) {
        for (let i = 0; i < state.modules.length; i++) {
            if (state.modules[i].id === action.input.id) {
                state.modules[i].name = action.input.name || '';
            }
        }
    },

    setModuleDescriptionOperation(state, action) {
        for (let i = 0; i < state.modules.length; i++) {
            if (state.modules[i].id === action.input.id) {
                state.modules[i].description = action.input.description || '';
            }
        }
    },

    deleteModuleOperation(state, action) {
        state.modules = state.modules.filter(m => m.id != action.input.id);
    },

    reorderModulesOperation(state, action) {
        state.modules.sort(moduleSorter(action.input.order));
    },
};
