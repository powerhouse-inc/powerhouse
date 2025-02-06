import type { Module, Operation } from "document-model/document-model";
import { toConstantCase } from "../schemas/inputs.js";
import { TextField } from "./text-field.js";
import { useCallback } from "react";

type Props = {
  module: Module;
  operation?: Operation;
  focusOnMount?: boolean;
  allOperationNames: string[];
  onAddOperationAndInitialSchema: (
    moduleId: string,
    name: string,
  ) => Promise<string | undefined>;
  updateOperationName: (id: string, name: string) => void;
  deleteOperation: (id: string) => void;
};

export function OperationForm({
  operation,
  module,
  focusOnMount,
  allOperationNames,
  onAddOperationAndInitialSchema,
  updateOperationName,
  deleteOperation,
}: Props) {
  const isEdit = !!operation;

  const handleSubmit = useCallback(
    async (name: string) => {
      if (isEdit && name === "") {
        deleteOperation(operation.id);
        return;
      }

      const formattedName = toConstantCase(name);

      if (isEdit) {
        if (formattedName !== operation.name) {
          updateOperationName(operation.id, formattedName);
        }
      } else {
        await onAddOperationAndInitialSchema(module.id, formattedName);
      }
    },
    [
      isEdit,
      operation?.id,
      operation?.name,
      module.id,
      deleteOperation,
      updateOperationName,
      onAddOperationAndInitialSchema,
    ],
  );

  const handleChange = useCallback(
    (value: string) => {
      if (isEdit && value === "") {
        deleteOperation(operation.id);
      }
    },
    [isEdit, operation?.id, deleteOperation],
  );

  return (
    <TextField
      name="name"
      value={operation?.name}
      label={isEdit ? "Operation name" : "Add operation"}
      onSubmit={handleSubmit}
      onChange={handleChange}
      placeholder="Add operation"
      required={!isEdit}
      allowEmpty={!isEdit}
      shouldReset={!isEdit}
      focusOnMount={focusOnMount}
      unique={allOperationNames}
    />
  );
}
