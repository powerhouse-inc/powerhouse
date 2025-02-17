import type {
  Operation,
  Module as TModule,
} from "document-model";

import { Icon } from "@powerhousedao/design-system";
import { ModuleForm } from "./module-form.js";
import { Operations } from "./operations.js";
type Props = {
  module?: TModule;
  modules?: TModule[];
  allOperations: Operation[];
  lastCreatedModuleId: string | null;
  onAddModule: (name: string) => Promise<string | undefined>;
  updateModuleName: (id: string, name: string) => void;
  deleteModule: (id: string) => void;
  updateOperationName: (id: string, name: string) => void;
  deleteOperation: (id: string) => void;
  addOperationAndInitialSchema: (
    moduleId: string,
    name: string,
  ) => Promise<string | undefined>;
  updateOperationSchema: (id: string, newDoc: string) => void;
  setOperationDescription: (id: string, description: string) => void;
  addOperationError: (
    operationId: string,
    errorName: string,
  ) => Promise<string | undefined>;
  deleteOperationError: (id: string) => void;
  setOperationErrorName: (
    operationId: string,
    errorId: string,
    name: string,
  ) => void;
};
export function Module(props: Props) {
  const {
    module,
    modules,
    allOperations,
    lastCreatedModuleId,
    onAddModule,
    updateModuleName,
    deleteModule,
    updateOperationName,
    deleteOperation,
    addOperationAndInitialSchema,
    updateOperationSchema,
    setOperationDescription,
    addOperationError,
    deleteOperationError,
    setOperationErrorName,
  } = props;
  return (
    <div className="relative rounded-3xl bg-gray-100 p-6">
      <div className="mb-2 w-1/2 pr-6">
        <ModuleForm
          modules={modules}
          module={module}
          onAddModule={onAddModule}
          updateModuleName={updateModuleName}
        />
        {!!module && (
          <button
            aria-label="Delete module"
            tabIndex={-1}
            className="absolute right-1 top-1 p-2 text-gray-800 transition-colors hover:text-gray-500"
            onClick={() => {
              deleteModule(module.id);
            }}
          >
            <Icon name="Xmark" size={32} />
          </button>
        )}
      </div>
      {!!module && (
        <Operations
          module={module}
          allOperations={allOperations}
          shouldFocusNewOperation={module.id === lastCreatedModuleId}
          updateOperationName={updateOperationName}
          deleteOperation={deleteOperation}
          addOperationAndInitialSchema={addOperationAndInitialSchema}
          updateOperationSchema={updateOperationSchema}
          setOperationDescription={setOperationDescription}
          addOperationError={addOperationError}
          deleteOperationError={deleteOperationError}
          setOperationErrorName={setOperationErrorName}
        />
      )}
    </div>
  );
}
