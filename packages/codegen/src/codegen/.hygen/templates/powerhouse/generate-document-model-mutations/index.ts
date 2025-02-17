import { paramCase } from "change-case";
import { DocumentModelState } from "document-model";

export type Args = {
  documentModel: string;
  rootDir: string;
  subgraph: string;
};

export default {
  params: ({ args }: { args: Args }) => {
    const documentModel = JSON.parse(args.documentModel) as DocumentModelState;
    const latestSpec =
      documentModel.specifications[documentModel.specifications.length - 1];

    return {
      rootDir: args.rootDir,
      subgraph: args.subgraph,
      documentTypeId: documentModel.id,
      documentType: documentModel.name,
      schema: latestSpec.state.global.schema,
      modules: latestSpec.modules.map((m) => ({
        ...m,
        name: paramCase(m.name),
      })),
    };
  },
};
