import { DocumentModelState } from 'document-model/document-model';
import { Args } from '../generate-document-model';

type ModuleArgs = Args & { module: string };
export default {
    params: ({ args }: { args: ModuleArgs }) => {
        const documentModel = JSON.parse(
            args.documentModel,
        ) as DocumentModelState;
        const latestSpec =
            documentModel.specifications[
                documentModel.specifications.length - 1
            ];
        const filteredModules = latestSpec.modules.filter(
            m => m.name === args.module,
        );
        return {
            rootDir: args.rootDir,
            documentType: documentModel.name,
            module: args.module,
            actions:
                filteredModules.length > 0
                    ? filteredModules[0].operations.map(a => ({
                          name: a.name,
                          hasInput: a.schema !== null,
                          hasAttachment: a.schema?.includes(': Attachment'),
                      }))
                    : [],
        };
    },
};
