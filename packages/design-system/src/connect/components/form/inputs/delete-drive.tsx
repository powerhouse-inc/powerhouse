import { DriveNameInput } from "#connect";
import { Button, Icon } from "#powerhouse";
import { useCallback, useState } from "react";

export type DeleteDriveProps = {
  driveId: string;
  name: string;
  onDeleteDrive: (driveId: string) => void;
  closeModal: () => void;
};

export function DeleteDrive(props: DeleteDriveProps) {
  const { driveId, name, onDeleteDrive, closeModal } = props;
  const [driveNameInput, setDriveNameInput] = useState("");

  const isAllowedToDelete = driveNameInput === name;

  const deleteDrive = useCallback(() => {
    if (isAllowedToDelete) {
      onDeleteDrive(driveId);
      closeModal();
    }
  }, [isAllowedToDelete, onDeleteDrive, driveId, closeModal]);

  const onNameInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDriveNameInput(event.target.value);
    },
    [],
  );

  return (
    <div>
      <p className="mb-2 rounded-md bg-slate-50 p-4 text-center text-slate-200">
        Are you sure you want to delete this drive? All files and subfolders
        within it will be removed. Do you want to proceed?
      </p>
      <DriveNameInput
        icon={<Icon name="Lock" />}
        onChange={onNameInputChange}
        placeholder="Enter drive name..."
        value={driveNameInput}
      />
      <div className="flex gap-3">
        <Button className="w-full" color="light" onClick={closeModal}>
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
