import {
    AvailableOfflineToggle,
    DeleteDrive,
    Disclosure,
    Divider,
    DriveNameInput,
    Label,
    LocationInfo,
    PUBLIC,
    SharingType,
    SharingTypeFormInput,
    SWITCHBOARD,
    UiDriveNode,
} from '@/connect';
import { Button, Icon } from '@/powerhouse';
import { useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';

type Inputs = {
    name: string;
    sharingType: SharingType;
    availableOffline: boolean;
};

type DriveSettingsFormProps = {
    uiDriveNode: UiDriveNode;
    onSubmit: DriveSettingsFormSubmitHandler;
    handleCancel: () => void;
    handleDeleteDrive: () => void;
};

export type DriveSettingsFormSubmitHandler = SubmitHandler<Inputs>;

export function DriveSettingsForm(props: DriveSettingsFormProps) {
    const { uiDriveNode, onSubmit } = props;
    const { name, sharingType, availableOffline } = uiDriveNode;

    const [showLocationSettings, setShowLocationSettings] = useState(false);
    const [showDangerZone, setShowDangerZone] = useState(false);
    const [showDeleteDrive, setShowDeleteDrive] = useState(false);

    const { register, handleSubmit, control } = useForm<Inputs>({
        mode: 'onBlur',
        defaultValues: {
            name,
            sharingType,
            availableOffline,
        },
    });

    const location = sharingType === PUBLIC ? SWITCHBOARD : sharingType;

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <DriveNameInput {...register('name')} />
            <Divider className="my-4" />
            <Label htmlFor="sharingType">Sharing settings</Label>
            <SharingTypeFormInput control={control} />
            <Divider className="my-3" />
            <Disclosure
                title="Location"
                isOpen={showLocationSettings}
                onOpenChange={() =>
                    setShowLocationSettings(!showLocationSettings)
                }
            >
                <LocationInfo location={location} />
                <AvailableOfflineToggle {...register('availableOffline')} />
            </Disclosure>
            <Divider className="my-3" />
            <Disclosure
                title="Danger zone"
                isOpen={showDangerZone}
                onOpenChange={() => setShowDangerZone(!showDangerZone)}
            >
                <button
                    type="button"
                    className="flex gap-2 py-3 font-semibold text-red-900 transition hover:brightness-125"
                    onClick={() => setShowDeleteDrive(true)}
                >
                    <Icon name="Trash" />
                    Delete drive
                </button>
            </Disclosure>
            {showDeleteDrive && showDangerZone ? (
                <DeleteDrive
                    {...props}
                    onCancel={() => setShowDeleteDrive(false)}
                />
            ) : (
                <>
                    <Divider className="my-3" />
                    <Button type="submit" className="mb-4 w-full">
                        Confirm
                    </Button>
                </>
            )}
        </form>
    );
}
