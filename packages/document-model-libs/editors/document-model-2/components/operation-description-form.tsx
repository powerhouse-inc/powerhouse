import { Operation } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { TextField } from "./text-field";
import { useEffect, useRef } from "react";

type Props = {
  operation: Operation;
  handlers: DocumentActionHandlers;
  focusOnMount?: boolean;
};

export function OperationDescriptionForm({
  operation,
  handlers,
  focusOnMount,
}: Props) {
  const textFieldRef = useRef<{ focus: () => void } | null>(null);

  useEffect(() => {
    if (focusOnMount && textFieldRef.current) {
      textFieldRef.current.focus();
    }
  }, [focusOnMount]);

  return (
    <TextField
      ref={textFieldRef}
      name="description"
      value={operation.description}
      onSubmit={(newDescription) =>
        handlers.setOperationDescription(operation.id, newDescription)
      }
      label="Operation description"
      allowEmpty
      placeholder="Operation Description"
    />
  );
}
