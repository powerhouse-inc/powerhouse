import { setName } from "@powerhousedao/shared/document-model";
import { useSelectedAppModuleDocument } from "@powerhousedao/vetra/document-models/app-module";
import type { FormEventHandler, MouseEventHandler } from "react";
import { useState } from "react";

/** Displays the name of the selected AppModule document and allows editing it */
export function EditAppModuleName() {
  const [appModuleDocument, dispatch] = useSelectedAppModuleDocument();
  const [isEditing, setIsEditing] = useState(false);

  if (!appModuleDocument) return null;

  const appModuleDocumentName = appModuleDocument.header.name;

  const onClickEditAppModuleName: MouseEventHandler<HTMLButtonElement> = () => {
    setIsEditing(true);
  };

  const onClickCancelEditAppModuleName: MouseEventHandler<
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
          className="p-1 text-lg font-semibold text-gray-800 placeholder:text-gray-700 dark:text-slate-100 dark:placeholder:text-slate-200"
          type="text"
          name="name"
          defaultValue={appModuleDocumentName}
          autoFocus
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="text-sm text-gray-700 dark:text-slate-200"
          >
            Save
          </button>
          <button
            className="text-sm text-red-800 dark:text-red-100"
            onClick={onClickCancelEditAppModuleName}
          >
            Cancel
          </button>
        </div>
      </form>
    );

  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">
        {appModuleDocumentName}
      </h2>
      <button
        className="text-sm text-gray-700 dark:text-slate-200"
        onClick={onClickEditAppModuleName}
      >
        Edit Name
      </button>
    </div>
  );
}
