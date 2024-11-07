import { memo } from "react";
import { GraphQLSchema } from "graphql";
import { Modules } from "./components/modules";
import { Divider } from "./components/divider";
import { Errors } from "./components/errors";
import { StateSchemas } from "./components/state-schemas";
import { DocumentActionHandlers } from "./types";
import { Module, Operation } from "document-model/document-model";

type Props = {
  modelName: string;
  schema: GraphQLSchema;
  globalStateSchema: string;
  globalStateInitialValue: string;
  localStateSchema: string;
  localStateInitialValue: string;
  handlers: DocumentActionHandlers;
  modules: Module[];
  operations: Operation[];
  errors: string;
};
export function _DocumentModelEditor(props: Props) {
  const {
    modelName,
    schema,
    globalStateSchema,
    globalStateInitialValue,
    localStateSchema,
    localStateInitialValue,
    modules,
    operations,
    handlers,
    errors,
  } = props;

  if (!globalStateSchema) return null;

  return (
    <div>
      <StateSchemas
        modelName={modelName}
        schema={schema}
        globalStateSchema={globalStateSchema}
        globalStateInitialValue={globalStateInitialValue}
        localStateSchema={localStateSchema}
        localStateInitialValue={localStateInitialValue}
        handlers={handlers}
      />
      <Errors errors={errors} />
      <Divider />
      <h3 className="mb-6 text-lg">Global Operations</h3>
      <Modules
        schema={schema}
        modules={modules}
        allOperations={operations}
        handlers={handlers}
      />
    </div>
  );
}

export const DocumentModelEditor = memo(_DocumentModelEditor);
