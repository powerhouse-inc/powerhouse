import { memo, useRef, useEffect } from "react";
import { GraphQLSchema } from "graphql";
import { updateStateTypeNames } from "./utils/schema-updates";
import { Modules } from "./components/modules";
import { Divider } from "./components/divider";
import { Errors } from "./components/errors";
import { StateSchemas } from "./components/state-schemas";
import { DocumentActionHandlers } from "./types";
import { Module } from "document-model/document-model";

type Props = {
  modelName: string;
  schema: GraphQLSchema;
  globalStateSchema: string;
  globalStateInitialValue: string;
  localStateSchema: string;
  localStateInitialValue: string;
  handlers: DocumentActionHandlers;
  modules: Module[];
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
    handlers,
    errors,
  } = props;

  const previousModelNameRef = useRef(modelName);

  useEffect(() => {
    if (previousModelNameRef.current === modelName) return;

    const oldName = previousModelNameRef.current;
    previousModelNameRef.current = modelName;

    if (globalStateSchema) {
      const updatedGlobalSchema = updateStateTypeNames(
        globalStateSchema,
        oldName,
        modelName,
      );

      if (updatedGlobalSchema !== globalStateSchema) {
        handlers.setStateSchema(updatedGlobalSchema, "global");
      }
    }

    if (localStateSchema) {
      const updatedLocalSchema = updateStateTypeNames(
        localStateSchema,
        oldName,
        modelName,
      );

      if (updatedLocalSchema !== localStateSchema) {
        handlers.setStateSchema(updatedLocalSchema, "local");
      }
    }
  }, [modelName, globalStateSchema, localStateSchema, handlers]);

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
      <h3 className="text-lg">Global Operations</h3>
      <Modules schema={schema} modules={modules} handlers={handlers} />
    </div>
  );
}

export const DocumentModelEditor = memo(_DocumentModelEditor);
