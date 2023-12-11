import {
    AvailableOfflineToggle,
    DeleteDrive,
    Disclosure,
    Divider,
    DriveLocation,
    DriveNameInput,
    Label,
    LocationInfo,
    SharingType,
    SharingTypeFormInput,
} from '@/connect';
import { Button, Icon } from '@/powerhouse';
import { useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';

type Inputs = {
    driveName: string;
    sharingType: SharingType;
    availableOffline: boolean;
};

type DriveSettingsFormProps = Inputs & {
    location: DriveLocation;
    onSubmit: DriveSettingsFormSubmitHandler;
    onCancel: () => void;
    onDeleteDrive: () => void;
};

export type DriveSettingsFormSubmitHandler = SubmitHandler<Inputs>;

export function DriveSettingsForm(props: DriveSettingsFormProps) {
    const [showLocationSettings, setShowLocationSettings] = useState(false);
    const [showDangerZone, setShowDangerZone] = useState(false);
    const [showDeleteDrive, setShowDeleteDrive] = useState(false);
    const { register, handleSubmit, control } = useForm<Inputs>({
        defaultValues: {
            driveName: props.driveName,
            sharingType: props.sharingType,
            availableOffline: props.availableOffline,
        },
    });

    return (
        <form onSubmit={handleSubmit(props.onSubmit)}>
            <Label htmlFor="driveName">Drive Name</Label>
            <DriveNameInput {...register('driveName')} />
            <Divider className="mb-[18px] mt-4" />
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
                <LocationInfo location={props.location} />
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
                    <Icon name="trash" />
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
