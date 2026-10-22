import { useSelectedDrive } from "@powerhousedao/reactor-browser";
import { addFolder } from "@powerhousedao/shared/document-drive";
import { generateId } from "document-model";
import { useState } from "react";

/** Adds a folder inside the folder being viewed (or the drive's root). */
export function NewFolderForm({
  parentFolder,
}: {
  parentFolder: string | null;
}) {
  const [, dispatch] = useSelectedDrive();
  const [name, setName] = useState("");
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        dispatch(addFolder({ id: generateId(), name: trimmed, parentFolder }));
        setName("");
      }}
    >
      <input
        aria-label="New folder name"
        placeholder="New folder"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border-border bg-background min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="bg-secondary text-secondary-foreground rounded-md px-2 py-1 text-sm disabled:opacity-50"
      >
        Add folder
      </button>
    </form>
  );
}
