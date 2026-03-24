import { setName } from "document-model";
import type { FormEventHandler, MouseEventHandler } from "react";
import { useState } from "react";
import { useSelectedTestDocDocument } from "test/document-models/test-doc";

/** Displays the name of the selected TestDoc document and allows editing it */
export function EditTestDocName() {
  const [testDocDocument, dispatch] = useSelectedTestDocDocument();
  const [isEditing, setIsEditing] = useState(false);

  if (!testDocDocument) return null;

  const testDocDocumentName = testDocDocument.header.name;

  const onClickEditTestDocName: MouseEventHandler<HTMLButtonElement> = () => {
    setIsEditing(true);
  };

  const onClickCancelEditTestDocName: MouseEventHandler<
    HTMLButtonElement
  > = () => {
    setIsEditing(false);
  };

  const onSubmitSetName: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const nameInput = form.elements.namedItem("name") as HTMLInputElement;
    const name = nameInput.value;
    if (!name) return;

    dispatch(setName(name));
    setIsEditing(false);
  };

  if (isEditing)
    return (
      <form
        className="flex items-center justify-between gap-2"
        onSubmit={onSubmitSetName}
      >
        <input
          className="p-1 text-lg font-semibold text-gray-900"
          type="text"
          name="name"
          defaultValue={testDocDocumentName}
          autoFocus
        />
        <div className="flex gap-2">
          <button type="submit" className="text-sm text-gray-600">
            Save
          </button>
          <button
            className="text-sm text-red-800"
            onClick={onClickCancelEditTestDocName}
          >
            Cancel
          </button>
        </div>
      </form>
    );

  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-gray-900">
        {testDocDocumentName}
      </h2>
      <button
        className="text-sm text-gray-600"
        onClick={onClickEditTestDocName}
      >
        Edit Name
      </button>
    </div>
  );
}
