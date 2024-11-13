import { Module } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { toLowercaseSnakeCase } from "../schemas";
import { TextField } from "./text-field";

type Props = {
  handlers: DocumentActionHandlers;
  modules?: Module[];
  module?: Module;
};

export function ModuleForm({ module, handlers, modules = [] }: Props) {
  const isEdit = !!module;
  const moduleNames = modules.map((m) => m.name);

  const handleSubmit = async (name: string) => {
    const formattedName = toLowercaseSnakeCase(name);
    if (!formattedName.length) return;

    if (isEdit) {
      if (formattedName !== module.name) {
        handlers.updateModuleName(module.id, formattedName);
      }
    } else {
      await handlers.addModule(formattedName);
    }
  };

  return (
    <TextField
      key={module?.id ?? "new"}
      name="name"
      label={isEdit ? "Module name" : "Add module"}
      value={module?.name}
      onSubmit={handleSubmit}
      placeholder="Add module"
      unique={moduleNames}
      shouldReset={!isEdit}
      required
    />
  );
}
