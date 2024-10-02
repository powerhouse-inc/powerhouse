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
    readonly onSubmit: CreateDriveFormSubmitHandler;
    readonly onCancel: () => void;
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
                icon={<Icon name="Drive" />}
                placeholder="Drive name"
            />
            <Divider className="my-4" />
            <Label htmlFor="sharingType">Sharing settings</Label>
            <SharingTypeFormInput control={control} />
            <Divider className="my-3" />
            <Disclosure
                isOpen={showUpload}
                onOpenChange={() => setShowUpload(!showUpload)}
                title="Upload from device"
            >
                <div className="mt-3 grid h-[117px] w-full place-items-center rounded-xl bg-gray-200">
                    <div className="rounded-xl bg-white p-3 text-xs">
                        <Icon
                            className="mr-2 inline-block"
                            name="ArrowUp"
                            size={20}
                        />
                        Click or drop folder
                    </div>
                </div>
            </Disclosure>
            <Divider className="my-3" />
            <Disclosure
                isOpen={showLocationSettings}
                onOpenChange={() =>
                    setShowLocationSettings(!showLocationSettings)
                }
                title="Location"
            >
                <LocationInfo location={SWITCHBOARD} />
                <AvailableOfflineToggle {...register('availableOffline')} />
            </Disclosure>
            <Divider className="my-3" />
            <Button className="mb-4 w-full" type="submit">
                Create new drive
            </Button>
        </form>
    );
}
