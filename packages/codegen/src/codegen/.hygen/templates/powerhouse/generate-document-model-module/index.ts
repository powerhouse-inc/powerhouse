import { DocumentModelState, OperationScope } from "document-model";
import { paramCase } from "change-case";
import { Args } from "../generate-document-model/index.js";

type ModuleArgs = Args & { module: string };
type Actions = {
  name: string | null;
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
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            scope: a.scope || "global",
            state: a.scope === "global" ? "" : a.scope, // the state this action affects
            errors: a.errors,
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
