import { DocumentModelState } from "@acaldas/document-model-graphql/document-model";

export default {
    params: ({ args }) => {
        const documentModel = JSON.parse(args.documentModel) as DocumentModelState;
        const latestSpec = documentModel.specifications[documentModel.specifications.length - 1];
        const filteredModules = latestSpec.modules.filter(
            m => m.name === args.module
        );
        return {
            documentType: documentModel.name,
            module: args.module,
            actions:
                filteredModules.length > 0
                    ? filteredModules[0].operations.map(a => ({ name: a.name, hasInput: (a.schema !== null) }))
                    : [],
        };
    },
};
