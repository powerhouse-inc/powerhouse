import { Module, Operation } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { toConstantCase } from "../schemas";
import { TextField } from "./text-field";

type Props = {
  handlers: DocumentActionHandlers;
  module: Module;
  operation?: Operation;
  focusOnMount?: boolean;
  allOperationNames: string[];
};

export function OperationForm({
  operation,
  module,
  handlers,
  focusOnMount,
  allOperationNames,
}: Props) {
  const isEdit = !!operation;

  const handleSubmit = async (name: string) => {
    if (isEdit && name === "") {
      handlers.deleteOperation(operation.id);
      return;
    }

    const formattedName = toConstantCase(name);

    if (isEdit) {
      if (formattedName !== operation.name) {
        handlers.updateOperationName(operation.id, formattedName);
      }
    } else {
      await handlers.addOperationAndInitialSchema(module.id, formattedName);
    }
  };

  const handleChange = (value: string) => {
    if (isEdit && value === "") {
      handlers.deleteOperation(operation.id);
    }
  };

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
