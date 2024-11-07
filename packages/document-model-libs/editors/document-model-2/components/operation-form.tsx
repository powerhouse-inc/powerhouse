import { Module, Operation } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { toConstantCase } from "../schemas";
import { Icon } from "@powerhousedao/design-system";
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
    const formattedName = toConstantCase(name);
    if (!formattedName.length) return;

    if (isEdit) {
      if (formattedName !== operation.name) {
        handlers.updateOperationName(operation.id, formattedName);
      }
    } else {
      await handlers.addOperationAndInitialSchema(module.id, formattedName);
    }
  };

  return (
    <div className="grid h-fit grid-cols-[1fr,auto] gap-1">
      <TextField
        name="name"
        value={operation?.name}
        onSubmit={handleSubmit}
        placeholder="Add operation"
        required
        shouldReset
        focusOnMount={focusOnMount}
        unique={allOperationNames}
      />
      {!!operation && (
        <button
          tabIndex={-1}
          type="button"
          onClick={() => handlers.deleteOperation(operation.id)}
        >
          <Icon name="Xmark" />
        </button>
      )}
    </div>
  );
}
