import { ModuleForm } from "./module-form";
import { Operations } from "./operations";
import { DocumentActionHandlers } from "../types";
import { Module, Operation } from "document-model/document-model";
import { GraphQLSchema } from "graphql";
import { useId, useState, useRef } from "react";
import { Divider } from "./divider";

type Props = {
  modules: Module[];
  allOperations: Operation[];
  handlers: DocumentActionHandlers;
};
export function Modules({ modules, allOperations, handlers }: Props) {
  const [lastCreatedModuleId, setLastCreatedModuleId] = useState<string | null>(
    null,
  );
  const focusTrapRef = useRef<HTMLDivElement>(null);
  const addModuleFormId = useId();

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
    <div className="">
      {modules.map((module) => (
        <div className="" key={module.id}>
          <div className="my-4">
            <ModuleForm
              modules={modules}
              handlers={wrappedHandlers}
              module={module}
            />
            <Divider />
          </div>
          <Operations
            module={module}
            handlers={wrappedHandlers}
            allOperations={allOperations}
            shouldFocusNewOperation={module.id === lastCreatedModuleId}
          />
        </div>
      ))}
      <div className="mt-6 pb-12">
        <ModuleForm
          key={addModuleFormId}
          modules={modules}
          handlers={wrappedHandlers}
        />
      </div>
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
