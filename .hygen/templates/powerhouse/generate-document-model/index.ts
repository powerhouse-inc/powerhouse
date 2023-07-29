import { DocumentModelState } from "@acaldas/document-model-graphql/document-model";

export default {
    params: ({ args }) => {
        const documentModel = JSON.parse(args.documentModel) as DocumentModelState;
        const latestSpec = documentModel.specifications[documentModel.specifications.length - 1];
        return {
            documentType: documentModel.name,
            extension: documentModel.extension,
            modules: latestSpec.modules,
        };
    },
};
