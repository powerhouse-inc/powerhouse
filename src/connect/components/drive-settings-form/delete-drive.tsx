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
            <p className="mb-2 rounded-[6px] bg-[#F3F5F7] p-4 text-center text-[#6C7275]">
                Are you sure you want to delete this drive? All files and
                subfolders within it will be removed. Do you want to proceed?
            </p>
            <div className="mb-6 flex gap-2 rounded-xl bg-[#F4F4F4] p-3  text-[#6C7275]">
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
                    className="w-full rounded-xl bg-[#F3F5F7] px-6 py-3 text-[#6C7275] transition hover:opacity-80"
                >
                    Cancel
                </button>
                <button
                    onClick={handleDeleteDrive}
                    disabled={!isAllowedToDelete}
                    className="w-full rounded-xl bg-[#EA4335] px-6 py-3 text-[#EFEFEF] transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50 disabled:brightness-100"
                >
                    Delete
                </button>
            </div>
        </div>
    );
}
