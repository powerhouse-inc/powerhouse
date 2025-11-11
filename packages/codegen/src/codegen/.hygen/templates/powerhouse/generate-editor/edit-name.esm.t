---
to: "<%= rootDir %>/<%= paramCaseEditorName %>/components/EditName.tsx"
unless_exists: true
---
import { setName } from "document-model";
import type { FormEventHandler, MouseEventHandler } from "react";
import { useState } from "react";
<% if(!documentType){ %>import { useSelectedDocument } from "@powerhousedao/reactor-browser";<% } else { %>import { <%= useSelectedHookName %> %>} from "<%= documentModelDir %>";<% } %>

/** Displays the name of the selected <%= pascalCaseDocumentType %> document and allows editing it */
export function <%= editNameComponentName %>() {
  const [<%= documentVariableName %>, dispatch] = <%= useSelectedHookName %>();
  const [isEditing, setIsEditing] = useState(false);

  if (!<%= documentVariableName %>) return null;

  const <%= documentVariableName %>Name = <%= documentVariableName %>.header.name;

  const onClickEdit<%= pascalCaseDocumentType %>Name: MouseEventHandler<HTMLButtonElement> = () => {
    setIsEditing(true);
  };

  const onClickCancelEdit<%= pascalCaseDocumentType %>Name: MouseEventHandler<
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
        className="flex gap-2 items-center justify-between"
        onSubmit={onSubmitSetName}
      >
        <input
          className="text-lg font-semibold text-gray-900 p-1"
          type="text"
          name="name"
          defaultValue={<%= documentVariableName %>Name}
          autoFocus
        />
        <div className="flex gap-2">
          <button type="submit" className="text-sm text-gray-600">
            Save
          </button>
          <button
            className="text-sm text-red-800"
            onClick={onClickCancelEdit<%= pascalCaseDocumentType %>Name}
          >
            Cancel
          </button>
        </div>
      </form>
    );

  return (
    <div className="flex justify-between items-center">
      <h2 className="text-lg font-semibold text-gray-900">{<%= documentVariableName %>Name}</h2>
      <button
        className="text-sm text-gray-600"
        onClick={onClickEdit<%= pascalCaseDocumentType %>Name}
      >
        Edit Name
      </button>
    </div>
  );
}
