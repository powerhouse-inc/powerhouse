import { DocumentActionHandlers } from "../types";
import { Module as TModule, Operation } from "document-model/document-model";
import { useState, useRef } from "react";
import { Module } from "./module";

type Props = {
  modules: TModule[];
  allOperations: Operation[];
  handlers: DocumentActionHandlers;
};
export function Modules({ modules, allOperations, handlers }: Props) {
  const [lastCreatedModuleId, setLastCreatedModuleId] = useState<string | null>(
    null,
  );
  const focusTrapRef = useRef<HTMLDivElement>(null);

  const wrappedHandlers = {
    ...handlers,
    addModule: async (name: string) => {
      const moduleId = await handlers.addModule(name);
      if (moduleId) {
        setLastCreatedModuleId(moduleId);
        focusTrapRef.current?.focus();
      }
      return moduleId;
    },
  };

  return (
    <div className="flex flex-col gap-2">
      {modules.map((module) => (
        <Module
          key={module.id}
          module={module}
          modules={modules}
          allOperations={allOperations}
          lastCreatedModuleId={lastCreatedModuleId}
          wrappedHandlers={wrappedHandlers}
        />
      ))}
      <Module
        key="add-module"
        modules={modules}
        allOperations={allOperations}
        lastCreatedModuleId={lastCreatedModuleId}
        wrappedHandlers={wrappedHandlers}
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
