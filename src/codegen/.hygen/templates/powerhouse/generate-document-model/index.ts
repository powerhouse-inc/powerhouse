import { DocumentModelState } from 'document-model/document-model';

function documentModelToString(documentModel: DocumentModelState) {
    return JSON.stringify(
        {
            ...documentModel,
            specifications: documentModel.specifications.map(s => ({
                ...s,
                state: {
                    ...s.state,
                    // initial value has to be stringified twice
                    // as it is expected to be a string
                    initialValue: JSON.stringify(s.state.initialValue),
                },
            })),
        },
        null,
        4,
    );
}

export type Args = {
    documentModel: string;
    rootDir: string;
};

export default {
    params: ({ args }: { args: Args }) => {
        const documentModel = JSON.parse(
            args.documentModel,
        ) as DocumentModelState;
        const latestSpec =
            documentModel.specifications[
                documentModel.specifications.length - 1
            ];

        return {
            rootDir: args.rootDir,
            documentModel: documentModelToString(documentModel),
            documentTypeId: documentModel.id,
            documentType: documentModel.name,
            extension: documentModel.extension,
            modules: latestSpec.modules,
            initialStateValue: latestSpec.state.initialValue,
            fileExtension: documentModel.extension,
        };
    },
};
