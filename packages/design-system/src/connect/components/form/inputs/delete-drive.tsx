import { Button, DriveNameInput, Icon } from "@powerhousedao/design-system";
import { type DocumentDriveDocument } from "document-drive";
import { useState } from "react";

export type DeleteDriveProps = {
  drive: DocumentDriveDocument;
  handleDeleteDrive: () => void;
  onCancel: () => void;
};

export function DeleteDrive(props: DeleteDriveProps) {
  const { drive, handleDeleteDrive, onCancel } = props;
  const [driveNameInput, setDriveNameInput] = useState("");

  const isAllowedToDelete = driveNameInput === drive.header.name;

  function deleteDrive() {
    if (isAllowedToDelete) {
      handleDeleteDrive();
    }
  }

  return (
    <div>
      <p className="mb-2 rounded-md bg-slate-50 p-4 text-center text-slate-200">
        Are you sure you want to delete this drive? All files and subfolders
        within it will be removed. Do you want to proceed?
      </p>
      <DriveNameInput
        icon={<Icon name="Lock" />}
        onChange={(event) => setDriveNameInput(event.target.value)}
        placeholder="Enter drive name..."
        value={driveNameInput}
      />
      <div className="flex gap-3">
        <Button className="w-full" color="light" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="w-full"
          color="red"
          disabled={!isAllowedToDelete}
          onClick={deleteDrive}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
