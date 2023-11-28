import { Icon } from '@/powerhouse';
import { useState } from 'react';
import { Controller, SubmitHandler, useForm } from 'react-hook-form';
import { twJoin, twMerge } from 'tailwind-merge';
import { Divider, DriveSettingsSelect, Toggle } from '..';
import { DeleteDrive } from './delete-drive';

type Inputs = {
    driveName: string;
    sharingType: 'private' | 'shared' | 'public';
    availableOffline: boolean;
};

export type DriveSettingsFormProps = Inputs & {
    location: 'cloud' | 'local' | 'switchboard';
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

    const sharingTypeOptions = [
        {
            value: 'private',
            icon: <Icon name="lock" />,
            description: 'Only available to you',
        },
        {
            value: 'shared',
            icon: <Icon name="people" />,
            description: 'Only available to people in this drive',
        },
        {
            value: 'public',
            icon: <Icon name="globe" />,
            description: 'Available to everyone',
            disabled: true,
        },
    ];
    const locationInfo = getLocationInfo();

    function getLocationInfo() {
        switch (props.location) {
            case 'cloud':
                return {
                    title: 'Secure cloud',
                    description: 'End to end encryption between members.',
                    icon: <Icon name="lock" />,
                };
            case 'local':
                return {
                    title: 'Local',
                    description: 'Private and only available to you.',
                    icon: <Icon name="hdd" />,
                };
            case 'switchboard':
                return {
                    title: 'Switchboard',
                    description: 'Public and available to everyone.',
                    icon: <Icon name="drive" />,
                };
        }
    }

    return (
        <form onSubmit={handleSubmit(props.onSubmit)}>
            <label
                htmlFor="driveName"
                className="mb-3 block font-semibold text-[#9EA0A1]"
            >
                Drive Name
            </label>
            <div className="flex gap-2 rounded-xl bg-[#F4F4F4] p-3 text-[#6C7275]">
                <Icon name="drive" />
                <input
                    id="driveName"
                    className="w-full bg-transparent font-semibold outline-none"
                    {...register('driveName')}
                />
            </div>
            <Divider className="mb-[18px] mt-4" />
            <label
                htmlFor="sharingType"
                className="mb-3 block font-semibold text-[#9EA0A1]"
            >
                Sharing settings
            </label>
            <Controller
                name="sharingType"
                control={control}
                render={({ field }) => (
                    <DriveSettingsSelect
                        {...field}
                        id="sharingType"
                        items={sharingTypeOptions}
                    />
                )}
            />
            <Divider className="my-3" />
            <div
                className="flex cursor-pointer justify-between text-[#9EA0A1]"
                onClick={() => setShowLocationSettings(!showLocationSettings)}
            >
                <h2 className=" font-semibold text-[#9EA0A1]">Location</h2>
                <Icon
                    name="chevron-down"
                    className={twJoin(
                        'transition',
                        showLocationSettings ? '' : '-rotate-90',
                    )}
                />
            </div>
            <div
                className={twMerge(
                    'max-h-0 overflow-hidden transition-[max-height] duration-300 ease-in-out',
                    showLocationSettings && 'max-h-[100vh]',
                )}
            >
                <div
                    className="my-3 flex items-center gap-2 rounded-xl border border-[#F4F4F4] p-3 text-[#404446]"
                    style={{
                        boxShadow:
                            '0px 4px 8px -4px rgba(0, 0, 0, 0.02), 0px -1px 1px 0px rgba(0, 0, 0, 0.04) inset',
                    }}
                >
                    {locationInfo.icon}
                    <div>
                        <p>{locationInfo.title}</p>
                        <p className="text-xs text-[#6C7275]">
                            {locationInfo.description}
                        </p>
                    </div>
                </div>
                <div className="flex items-center rounded-xl bg-[#F4F4F4] p-3 text-[#6C7275]">
                    <div className="flex-1">
                        <label
                            htmlFor="availableOffline"
                            className="font-semibold"
                        >
                            Make available offline
                        </label>
                        <p className="text-xs text-[#9EA0A1]">
                            Check this options if you keep a local backup
                            <br />
                            available at all times.
                        </p>
                    </div>
                    <Toggle
                        id="availableOffline"
                        {...register('availableOffline')}
                    />
                </div>
            </div>
            <Divider className="my-3" />
            <div
                className="flex cursor-pointer justify-between text-[#9EA0A1]"
                onClick={() => setShowDangerZone(!showDangerZone)}
            >
                <h2 className=" font-semibold text-[#9EA0A1]">Danger zone</h2>
                <Icon
                    name="chevron-down"
                    className={twJoin(
                        'transition',
                        showDangerZone ? '' : '-rotate-90',
                    )}
                />
            </div>
            <div
                className={twMerge(
                    'max-h-0 overflow-hidden transition-[max-height] duration-300 ease-in-out',
                    showDangerZone && 'max-h-[100vh]',
                )}
            >
                <button
                    type="button"
                    className="mt-3 flex gap-2 py-3 font-semibold text-[#EA4335] transition hover:brightness-125"
                    onClick={() => setShowDeleteDrive(true)}
                >
                    <Icon name="trash" />
                    Delete drive
                </button>
            </div>
            {showDeleteDrive && showDangerZone ? (
                <DeleteDrive
                    {...props}
                    onCancel={() => setShowDeleteDrive(false)}
                />
            ) : (
                <>
                    <Divider className="my-3" />
                    <input
                        type="submit"
                        value="Confirm"
                        className="mb-4 w-full cursor-pointer rounded-xl bg-[#404446] px-6 py-3 text-center font-semibold text-[#FEFEFE] transition hover:brightness-125"
                    />
                    <button
                        onClick={props.onCancel}
                        className="w-full rounded-xl border border-[#E7E9EA] bg-[#F3F5F7] px-6 py-3 text-center font-semibold text-[#6C7275] transition hover:opacity-80"
                    >
                        Cancel
                    </button>
                </>
            )}
        </form>
    );
}
