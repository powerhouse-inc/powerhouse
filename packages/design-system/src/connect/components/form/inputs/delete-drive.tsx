import { DriveNameInput, type UiDriveNode } from "@/connect";
import { Button, Icon } from "#powerhouse";
import { useState } from "react";

export type DeleteDriveProps = {
  readonly uiDriveNode: UiDriveNode;
  readonly handleDeleteDrive: () => void;
  readonly onCancel: () => void;
};

export function DeleteDrive(props: DeleteDriveProps) {
  const { uiDriveNode, handleDeleteDrive, onCancel } = props;
  const [driveNameInput, setDriveNameInput] = useState("");

  const isAllowedToDelete = driveNameInput === uiDriveNode.name;

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
