import { DocumentModelState } from '@powerhouse/document-model/document-model';

export default {
    params: ({ args }: { args: { documentModel: string } }) => {
        const documentModel = JSON.parse(
            args.documentModel,
        ) as DocumentModelState;
        const latestSpec =
            documentModel.specifications[
                documentModel.specifications.length - 1
            ];
        return {
            documentModel: JSON.stringify(documentModel, null, 4),
            documentTypeId: documentModel.id,
            documentType: documentModel.name,
            extension: documentModel.extension,
            modules: latestSpec.modules,
            initialStateValue: latestSpec.state.initialValue,
            fileExtension: documentModel.extension,
        };
    },
};
