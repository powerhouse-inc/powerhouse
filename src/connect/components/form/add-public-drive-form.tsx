import {
    AddDriveInput,
    AvailableOfflineToggle,
    Disclosure,
    Divider,
    DriveName,
    FormInput,
    Label,
    LocationInfo,
} from '@/connect';
import { Button, Icon } from '@/powerhouse';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useDebounce } from 'usehooks-ts';

interface PublicDriveDetails extends AddDriveInput {
    id: string;
    driveName: string;
    sharingType: 'PUBLIC';
    location: 'SWITCHBOARD';
    availableOffline: boolean;
}

type Inputs = {
    availableOffline: boolean;
};

export type AddPublicDriveInput = PublicDriveDetails & { url: string };

type AddPublicDriveFormProps = {
    onSubmit: (data: AddPublicDriveInput) => void;
    onCancel: () => void;
};

export function AddPublicDriveForm(props: AddPublicDriveFormProps) {
    const [url, setUrl] = useState('');
    const [publicDriveDetails, setPublicDriveDetails] =
        useState<PublicDriveDetails>();
    const [showLocationSettings, setShowLocationSettings] = useState(false);
    const [isUrlValid, setIsUrlValid] = useState(true);
    const [hasConfirmedUrl, setHasConfirmedUrl] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const debouncedUrl = useDebounce(url, 500);
    const { register, handleSubmit, setValue } = useForm<Inputs>({
        defaultValues: {
            availableOffline: publicDriveDetails?.availableOffline ?? false,
        },
    });

    useEffect(() => {
        setHasConfirmedUrl(false);
        if (debouncedUrl === '') return;
        mockFetchPublicDrive().catch(console.error);

        async function mockFetchPublicDrive() {
            const response = await mockGetPublicDrive(debouncedUrl);
            const isUrlValid = response.status === 200;
            if (isUrlValid) {
                setPublicDriveDetails({
                    id: response.id,
                    driveName: response.driveName,
                    sharingType: response.sharingType,
                    location: response.location,
                    availableOffline: response.availableOffline,
                });
                setValue('availableOffline', response.availableOffline);
                setIsUrlValid(true);
                setErrorMessage('');
            } else {
                setPublicDriveDetails(undefined);
                setIsUrlValid(false);
                setErrorMessage(response.statusText);
            }
        }
    }, [debouncedUrl, setValue]);

    function onSubmit({ availableOffline }: Inputs) {
        if (!publicDriveDetails) return;
        props.onSubmit({ ...publicDriveDetails, availableOffline, url });
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <Label htmlFor="url">Add existing drive</Label>
            {hasConfirmedUrl ? (
                <>
                    <DriveName
                        driveName={publicDriveDetails?.driveName ?? 'New drive'}
                    />
                    <Divider className="my-3" />
                    <Disclosure
                        title="Location"
                        isOpen={showLocationSettings}
                        onOpenChange={() =>
                            setShowLocationSettings(!showLocationSettings)
                        }
                    >
                        <LocationInfo location="SWITCHBOARD" />
                        <AvailableOfflineToggle
                            {...register('availableOffline')}
                        />
                    </Disclosure>
                    <Divider className="my-3" />
                    <Button type="submit" color="dark" className="mt-4 w-full">
                        Add drive
                    </Button>
                </>
            ) : (
                <>
                    <FormInput
                        type="url"
                        icon={<Icon name="brick-globe" />}
                        value={url}
                        placeholder="Drive URL"
                        required
                        onChange={e => setUrl(e.target.value)}
                        errorOverride={errorMessage}
                    />
                    <Divider className="mb-3" />
                    <Button
                        type="button"
                        color="light"
                        className="mt-4 w-full"
                        onClick={e => {
                            e.preventDefault();
                            setHasConfirmedUrl(true);
                        }}
                        disabled={!isUrlValid || url === ''}
                    >
                        Confirm URL
                    </Button>
                </>
            )}
        </form>
    );
}

function mockGetPublicDrive(url: string) {
    const isValidUrl = true; //url.includes('https://connect.powerhouse.xyz');

    if (!isValidUrl)
        return Promise.resolve({
            status: 404 as const,
            statusText: 'Drive does not exist. Please check URL',
        });

    return Promise.resolve({
        status: 200 as const,
        driveName: 'Switchboard',
        id: '1',
        sharingType: 'PUBLIC' as const,
        location: 'SWITCHBOARD' as const,
        availableOffline: true,
    });
}
