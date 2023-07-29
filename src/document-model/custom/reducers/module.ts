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
        const latestSpec = state.specifications[state.specifications.length - 1];
        latestSpec.modules.push({
            id: hashKey(),
            name: action.input.name,
            description: action.input.description || '',
            operations: [],
        });
    },

    setModuleNameOperation(state, action) {
        const latestSpec = state.specifications[state.specifications.length - 1];
        for (let i = 0; i < latestSpec.modules.length; i++) {
            if (latestSpec.modules[i].id === action.input.id) {
                latestSpec.modules[i].name = action.input.name || '';
            }
        }
    },

    setModuleDescriptionOperation(state, action) {
        const latestSpec = state.specifications[state.specifications.length - 1];
        for (let i = 0; i < latestSpec.modules.length; i++) {
            if (latestSpec.modules[i].id === action.input.id) {
                latestSpec.modules[i].description = action.input.description || '';
            }
        }
    },

    deleteModuleOperation(state, action) {
        const latestSpec = state.specifications[state.specifications.length - 1];
        latestSpec.modules = latestSpec.modules.filter(m => m.id != action.input.id);
    },

    reorderModulesOperation(state, action) {
        const latestSpec = state.specifications[state.specifications.length - 1];
        latestSpec.modules.sort(moduleSorter(action.input.order));
    },
};
