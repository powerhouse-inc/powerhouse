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
import { requestPublicDrive } from 'document-drive/utils/graphql';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useDebounceValue } from 'usehooks-ts';

interface PublicDriveDetails extends AddDriveInput {
    id: string;
    driveName: string;
    sharingType: 'PUBLIC' | 'SHARED';
    location: 'SWITCHBOARD';
    availableOffline: boolean;
}

type Inputs = {
    availableOffline: boolean;
};

export type AddPublicDriveInput = PublicDriveDetails & { url: string };

type AddPublicDriveFormProps = {
    sharingType?: 'PUBLIC' | 'SHARED';
    onSubmit: (data: AddPublicDriveInput) => void;
    onCancel: () => void;
};

export function AddPublicDriveForm(props: AddPublicDriveFormProps) {
    const { sharingType = 'PUBLIC' } = props;
    const [publicDriveDetails, setPublicDriveDetails] =
        useState<PublicDriveDetails>();
    const [showLocationSettings, setShowLocationSettings] = useState(false);
    const [isUrlValid, setIsUrlValid] = useState(true);
    const [hasConfirmedUrl, setHasConfirmedUrl] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [url, setUrl] = useDebounceValue('', 500);
    const { register, handleSubmit, setValue } = useForm<Inputs>({
        mode: 'onBlur',
        defaultValues: {
            availableOffline: publicDriveDetails?.availableOffline ?? false,
        },
    });
    useEffect(() => {
        setHasConfirmedUrl(false);
        if (url === '') return;
        fetchPublicDrive().catch(console.error);

        async function fetchPublicDrive() {
            try {
                const { id, name } = await requestPublicDrive(url);
                setPublicDriveDetails({
                    id,
                    driveName: name,
                    sharingType,
                    location: 'SWITCHBOARD',
                    availableOffline: true,
                });
                setValue('availableOffline', true);
                setIsUrlValid(true);
                setErrorMessage('');
            } catch (error) {
                setPublicDriveDetails(undefined);
                setIsUrlValid(false);
                setErrorMessage((error as Error).message);
            }
        }
    }, [url, setValue, sharingType]);

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
                        errorMessage={errorMessage}
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
