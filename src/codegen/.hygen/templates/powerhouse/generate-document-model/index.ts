import { paramCase } from 'change-case';
import { DocumentModelState } from 'document-model/document-model';

function documentModelToString(documentModel: DocumentModelState) {
    return JSON.stringify(
        {
            ...documentModel,
            specifications: documentModel.specifications.map(s => ({
                ...s,
                state: Object.keys(s.state).reduce((values, scope) => {
                    const state = s.state[scope as keyof typeof s.state];
                    return {
                        ...values,
                        [scope]: {
                            ...state,
                            // initial value has to be stringified twice
                            // as it is expected to be a string
                            initialValue: JSON.stringify(state.initialValue),
                        },
                    };
                }, {}),
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
            modules: latestSpec.modules.map(m => ({
                ...m,
                name: paramCase(m.name),
            })),
            initialGlobalState: latestSpec.state.global.initialValue,
            initialLocalState: latestSpec.state.local.initialValue,
            fileExtension: documentModel.extension,
        };
    },
};
