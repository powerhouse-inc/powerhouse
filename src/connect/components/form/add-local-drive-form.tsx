import {
    AvailableOfflineToggle,
    Disclosure,
    Divider,
    FormInput,
    Label,
    LOCAL,
    LocationInfo,
    SharingType,
    SharingTypeFormInput,
    SWITCHBOARD,
} from '@/connect';
import { Button, Icon } from '@/powerhouse';
import { useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';

export type AddLocalDriveInput = {
    name: string;
    sharingType: SharingType;
    availableOffline: boolean;
};

type AddLocalDriveFormProps = {
    onSubmit: CreateDriveFormSubmitHandler;
    onCancel: () => void;
};

type CreateDriveFormSubmitHandler = SubmitHandler<AddLocalDriveInput>;

export function AddLocalDriveForm(props: AddLocalDriveFormProps) {
    const [showLocationSettings, setShowLocationSettings] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const {
        register,
        handleSubmit,
        control,
        formState: { errors },
    } = useForm<AddLocalDriveInput>({
        defaultValues: {
            name: '',
            sharingType: LOCAL,
            availableOffline: false,
        },
    });

    return (
        <form onSubmit={handleSubmit(props.onSubmit)}>
            <Label htmlFor="driveName">Drive Name</Label>
            <FormInput
                {...register('name', {
                    required: 'Drive name is required',
                })}
                errorMessage={errors.name?.message}
                icon={<Icon name="drive" />}
                placeholder="Drive name"
            />
            <Divider className="my-4" />
            <Label htmlFor="sharingType">Sharing settings</Label>
            <SharingTypeFormInput control={control} />
            <Divider className="my-3" />
            <Disclosure
                title="Upload from device"
                isOpen={showUpload}
                onOpenChange={() => setShowUpload(!showUpload)}
            >
                <div className="mt-3 grid h-[117px] w-full place-items-center rounded-xl bg-gray-200">
                    <div className="rounded-xl bg-white p-3 text-xs">
                        <Icon
                            name="arrow-up"
                            size={20}
                            className="mr-2 inline-block"
                        />
                        Click or drop folder
                    </div>
                </div>
            </Disclosure>
            <Divider className="my-3" />
            <Disclosure
                title="Location"
                isOpen={showLocationSettings}
                onOpenChange={() =>
                    setShowLocationSettings(!showLocationSettings)
                }
            >
                <LocationInfo location={SWITCHBOARD} />
                <AvailableOfflineToggle {...register('availableOffline')} />
            </Disclosure>
            <Divider className="my-3" />
            <Button type="submit" className="mb-4 w-full">
                Create new drive
            </Button>
        </form>
    );
}
