import { paramCase } from "change-case";
import type { DocumentModelState } from "document-model";
import type { Args } from "../generate-document-model/index.js";

type ModuleArgs = Args & { module: string };
type OperationError =
  DocumentModelState["specifications"][number]["modules"][number]["operations"][number]["errors"][number];
type Actions = {
  name: string | null;
  hasInput: boolean;
  hasAttachment: boolean | undefined;
  scope: string;
  state: string;
  errors: OperationError[];
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
            errors: a.errors,
          }))
        : [];

    const errors = actions.reduce<OperationError[]>((acc, action) => {
      action.errors.forEach((error) => {
        const existingError = acc.find((e) => e.code === error.code);
        if (!existingError) {
          acc.push(error);
        } else if (JSON.stringify(existingError) !== JSON.stringify(error)) {
          console.warn(
            `Warning: Duplicate error code "${error.code}" with different fields found`,
          );
        }
      });
      return acc;
    }, []);

    return {
      rootDir: args.rootDir,
      documentType: documentModel.name,
      module: paramCase(args.module),
      actions,
      errors,
    };
  },
};
