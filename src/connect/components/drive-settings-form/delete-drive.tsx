import { Icon } from '@/powerhouse';
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
            <div className="mb-6 flex gap-2 rounded-xl bg-grey-100 p-3  text-slate-200">
                <Icon name="lock" />
                <input
                    value={driveNameInput}
                    onChange={e => setDriveNameInput(e.target.value)}
                    placeholder="Enter drive name..."
                    id="driveName"
                    className="w-full bg-transparent font-semibold outline-none"
                />
            </div>
            <div className="flex gap-3">
                <button
                    onClick={props.onCancel}
                    className="w-full rounded-xl bg-slate-50 px-6 py-3 text-slate-200 transition hover:opacity-80"
                >
                    Cancel
                </button>
                <button
                    onClick={handleDeleteDrive}
                    disabled={!isAllowedToDelete}
                    className="w-full rounded-xl bg-red-900 px-6 py-3 text-grey-200 transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50 disabled:brightness-100"
                >
                    Delete
                </button>
            </div>
        </div>
    );
}
