import { DocumentModelState } from "document-model/document-model";
import { paramCase } from "change-case";
import { Maybe, OperationScope } from "document-model/document";
import { Args } from "../generate-document-model";

type ModuleArgs = Args & { module: string };
type Actions = {
  name: Maybe<string>;
  hasInput: boolean;
  hasAttachment: boolean | undefined;
  scope: OperationScope;
  state: string;
};

export default {
  params: ({ args }: { args: ModuleArgs }) => {
    const documentModel = JSON.parse(args.documentModel) as DocumentModelState;
    const latestSpec =
      documentModel.specifications[documentModel.specifications.length - 1];
    const filteredModules = latestSpec.modules.filter(
      (m) => m.name === args.module,
    );

    const actions: Actions[] =
      filteredModules.length > 0
        ? filteredModules[0].operations.map((a) => ({
            name: a.name,
            hasInput: a.schema !== null,
            hasAttachment: a.schema?.includes(": Attachment"),
            scope: a.scope || "global",
            state: a.scope === "global" ? "" : a.scope, // the state this action affects
          }))
        : [];

    return {
      rootDir: args.rootDir,
      documentType: documentModel.name,
      module: paramCase(args.module),
      actions,
    };
  },
};
