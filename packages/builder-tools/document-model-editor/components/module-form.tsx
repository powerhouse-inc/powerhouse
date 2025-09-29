import type { ModuleSpecification } from "document-model";
import { toLowercaseSnakeCase } from "../schemas/inputs.js";
import { TextField } from "./text-field.js";

type Props = {
  modules?: ModuleSpecification[];
  module?: ModuleSpecification;
  onAddModule: (name: string) => Promise<string | undefined>;
  updateModuleName: (id: string, name: string) => void;
};

export function ModuleForm({
  module,
  onAddModule,
  updateModuleName,
  modules = [],
}: Props) {
  const isEdit = !!module;
  const moduleNames = modules.map((m) => m.name);

  const handleSubmit = async (name: string) => {
    const formattedName = toLowercaseSnakeCase(name);
    if (!formattedName.length) return;

    if (isEdit) {
      if (formattedName !== module.name) {
        updateModuleName(module.id, formattedName);
      }
    } else {
      await onAddModule(formattedName);
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
