import type { Module as TModule } from "document-model";
import { useCallback, useRef, useState } from "react";
import { Module } from "./module.js";

type Props = {
  modules: TModule[];
  allOperations: TModule["operations"];
  addModule: (name: string) => Promise<string | undefined>;
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
export function Modules({
  modules,
  allOperations,
  addModule,
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
}: Props) {
  const [lastCreatedModuleId, setLastCreatedModuleId] = useState<string | null>(
    null,
  );
  const focusTrapRef = useRef<HTMLDivElement>(null);

  const onAddModule = useCallback(
    async (name: string) => {
      const moduleId = await addModule(name);
      if (moduleId) {
        setLastCreatedModuleId(moduleId);
        focusTrapRef.current?.focus();
      }
      return moduleId;
    },
    [addModule, setLastCreatedModuleId],
  );

  return (
    <div className="flex flex-col gap-2">
      {modules.map((module) => (
        <Module
          key={module.id}
          module={module}
          modules={modules}
          allOperations={allOperations}
          lastCreatedModuleId={lastCreatedModuleId}
          onAddModule={onAddModule}
          updateModuleName={updateModuleName}
          deleteModule={deleteModule}
          updateOperationName={updateOperationName}
          deleteOperation={deleteOperation}
          addOperationAndInitialSchema={addOperationAndInitialSchema}
          updateOperationSchema={updateOperationSchema}
          setOperationDescription={setOperationDescription}
          addOperationError={addOperationError}
          deleteOperationError={deleteOperationError}
          setOperationErrorName={setOperationErrorName}
        />
      ))}
      <Module
        key="add-module"
        modules={modules}
        allOperations={allOperations}
        lastCreatedModuleId={lastCreatedModuleId}
        onAddModule={onAddModule}
        updateModuleName={updateModuleName}
        deleteModule={deleteModule}
        updateOperationName={updateOperationName}
        deleteOperation={deleteOperation}
        addOperationAndInitialSchema={addOperationAndInitialSchema}
        updateOperationSchema={updateOperationSchema}
        setOperationDescription={setOperationDescription}
        addOperationError={addOperationError}
        deleteOperationError={deleteOperationError}
        setOperationErrorName={setOperationErrorName}
      />
      {/* Focus trap to prevent tabbing out of the editor */}
      <div
        ref={focusTrapRef}
        tabIndex={0}
        className="size-0 overflow-hidden"
        aria-hidden="true"
      />
    </div>
  );
}
