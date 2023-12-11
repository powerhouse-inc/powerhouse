import { DriveNameInput } from '@/connect';
import { Button, Icon } from '@/powerhouse';
import { useState } from 'react';

export type DeleteDriveProps = {
    driveName: string;
    onDeleteDrive: () => void;
    onCancel: () => void;
};

export function DeleteDrive(props: DeleteDriveProps) {
    const [driveNameInput, setDriveNameInput] = useState('');

    const isAllowedToDelete = driveNameInput === props.driveName;

    function handleDeleteDrive() {
        if (isAllowedToDelete) {
            props.onDeleteDrive();
        }
    }

    return (
        <div>
            <p className="mb-2 rounded-[6px] bg-slate-50 p-4 text-center text-slate-200">
                Are you sure you want to delete this drive? All files and
                subfolders within it will be removed. Do you want to proceed?
            </p>
            <DriveNameInput
                value={driveNameInput}
                placeholder="Enter drive name..."
                onChange={event => setDriveNameInput(event.target.value)}
                icon={<Icon name="lock" />}
            />
            <div className="flex gap-3">
                <Button
                    onClick={props.onCancel}
                    color="light"
                    className="w-full"
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleDeleteDrive}
                    disabled={!isAllowedToDelete}
                    color="red"
                    className="w-full"
                >
                    Delete
                </Button>
            </div>
        </div>
    );
}
