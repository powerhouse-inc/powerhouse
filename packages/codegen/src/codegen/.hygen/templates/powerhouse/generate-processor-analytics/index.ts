import { DocumentTypesMap } from "../../../../index.js";

export type Args = {
  name: string;
  rootDir: string;
  documentModelsDir: string;
  documentTypes: string;
  documentTypesMap: string;
};

export default {
  params: ({ args }: { args: Args }) => {
    return {
      rootDir: args.rootDir,
      documentModelsDir: args.documentModelsDir,
      name: args.name,
      documentTypes: args.documentTypes
        .split(",")
        .filter((type) => type !== ""),
      documentTypesMap: JSON.parse(args.documentTypesMap) as DocumentTypesMap,
    };
  },
};
