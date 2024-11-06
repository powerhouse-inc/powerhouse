import { ModuleForm } from "./module-form";
import { Operations } from "./operations";
import { DocumentActionHandlers } from "../types";
import { Module } from "document-model/document-model";
import { GraphQLSchema } from "graphql";
import { useId } from "react";

type Props = {
  schema: GraphQLSchema;
  modules: Module[];
  handlers: DocumentActionHandlers;
};
export function Modules({ schema, modules, handlers }: Props) {
  const addModuleFormId = useId();
  return (
    <div className="w-4/5">
      {modules.map((module, index) => (
        <div className="" key={module.id}>
          <div className="mt-4">
            <ModuleForm key={module.id} handlers={handlers} module={module} />
          </div>
          <Operations
            schema={schema}
            module={module}
            handlers={handlers}
            isNewModule={
              index === modules.length - 1 && module.operations.length === 0
            }
          />
        </div>
      ))}
      <div className="mt-12 pb-12">
        <ModuleForm key={addModuleFormId} handlers={handlers} />
      </div>
    </div>
  );
}
