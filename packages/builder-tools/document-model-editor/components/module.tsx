import type { ModuleSpecification as TModule } from "document-model";
import { ModuleForm } from "./module-form.js";
import { Operations } from "./operations.js";
type Props = {
  module?: TModule;
  modules?: TModule[];
  allOperations: TModule["operations"];
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
            <svg className="size-6" viewBox="0 0 24 24" fill="currentcolor">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M16.9993 8.51506L15.4844 7L11.9994 10.4852L8.51497 7.00057L7 8.51562L10.4844 12.0003L7.00056 15.4843L8.51552 16.9994L11.9994 13.5153L15.4838 17L16.9988 15.4849L13.5144 12.0003L16.9993 8.51506Z"
              />
            </svg>
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
