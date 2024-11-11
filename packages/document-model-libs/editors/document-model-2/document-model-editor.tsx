import { memo } from "react";
import { Modules } from "./components/modules";
import { Divider } from "./components/divider";
import { StateSchemas } from "./components/state-schemas";
import { DocumentActionHandlers } from "./types";
import { Module, Operation } from "document-model/document-model";

type Props = {
  modelName: string;
  globalStateSchema: string;
  globalStateInitialValue: string;
  localStateSchema: string;
  localStateInitialValue: string;
  handlers: DocumentActionHandlers;
  modules: Module[];
  operations: Operation[];
};
export function _DocumentModelEditor(props: Props) {
  const {
    modelName,
    globalStateSchema,
    globalStateInitialValue,
    localStateSchema,
    localStateInitialValue,
    modules,
    operations,
    handlers,
  } = props;

  if (!globalStateSchema) return null;

  return (
    <div>
      <StateSchemas
        modelName={modelName}
        globalStateSchema={globalStateSchema}
        globalStateInitialValue={globalStateInitialValue}
        localStateSchema={localStateSchema}
        localStateInitialValue={localStateInitialValue}
        handlers={handlers}
      />
      <Divider />
      <h3 className="mb-6 text-lg">Global Operations</h3>
      <Modules
        modules={modules}
        allOperations={operations}
        handlers={handlers}
      />
    </div>
  );
}

export const DocumentModelEditor = memo(_DocumentModelEditor);
