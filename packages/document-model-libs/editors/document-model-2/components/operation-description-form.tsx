import { Operation } from "document-model/document-model";
import { TextField } from "./text-field";
import { useEffect, useRef } from "react";

type Props = {
  operation: Operation;
  focusOnMount?: boolean;
  setOperationDescription: (id: string, description: string) => void;
};

export function OperationDescriptionForm({
  operation,
  focusOnMount,
  setOperationDescription,
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
        setOperationDescription(operation.id, newDescription)
      }
      label="Operation description"
      allowEmpty
      placeholder="Operation Description"
    />
  );
}
