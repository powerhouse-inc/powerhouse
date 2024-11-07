import { Module } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { toLowercaseSnakeCase } from "../schemas";
import { Icon } from "@powerhousedao/design-system";
import { TextField } from "./text-field";

type Props = {
  handlers: DocumentActionHandlers;
  modules: Module[];
  module?: Module;
};

export function ModuleForm({ modules, module, handlers }: Props) {
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
    <div className="grid grid-cols-[1fr,auto] gap-1">
      <TextField
        key={module?.id ?? "new"}
        name="name"
        value={module?.name}
        onSubmit={handleSubmit}
        placeholder="Add module"
        unique={moduleNames}
        required
        shouldReset
      />
      {!!module && (
        <button
          tabIndex={-1}
          type="button"
          onClick={() => handlers.deleteModule(module.id)}
        >
          <Icon name="Xmark" />
        </button>
      )}
    </div>
  );
}
