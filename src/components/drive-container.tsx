import {
    AddDriveInput,
    AddPublicDriveInput,
    ConnectDropdownMenuItem,
    DriveView,
    DriveViewProps,
    defaultDropdownMenuOptions,
    toast,
    useItemActions,
} from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useFeatureFlag } from 'src/hooks/useFeatureFlags';
import { FeatureFlag } from 'src/hooks/useFeatureFlags/default-config';
import { useOnDropEvent } from 'src/hooks/useOnDropEvent';

interface DriveContainerProps {
    disableHoverStyles?: boolean;
    setDisableHoverStyles?: (value: boolean) => void;
}

function isRemoteDriveInput(
    input: AddDriveInput | AddPublicDriveInput,
): input is AddPublicDriveInput {
    return Object.keys(input).includes('url');
}

const DriveSections = [
    { key: 'public', name: 'Public Drives', type: 'PUBLIC_DRIVE' },
    { key: 'cloud', name: 'Secure Cloud Drives', type: 'CLOUD_DRIVE' },
    { key: 'local', name: 'My Local Drives', type: 'LOCAL_DRIVE' },
] as const;

const getDrivesConfig = (
    driveType: 'public' | 'cloud' | 'local',
    config: FeatureFlag['drives'],
) => {
    if (driveType === 'public') {
        return {
            allowAdd: config.allowAddPublicDrives,
            allowDelete: config.allowDeletePublicDrives,
        };
    }

    if (driveType === 'cloud') {
        return {
            allowAdd: config.allowAddCloudDrives,
            allowDelete: config.allowDeleteCloudDrives,
        };
    }

    return {
        allowAdd: config.allowAddLocalDrives,
        allowDelete: config.allowDeleteLocalDrives,
    };
};

const getDriveOptions = (
    driveType: 'public' | 'cloud' | 'local',
    config: FeatureFlag['drives'],
) => {
    const driveConfig = getDrivesConfig(driveType, config);

    const options = driveConfig.allowDelete
        ? defaultDropdownMenuOptions
        : defaultDropdownMenuOptions.filter(option => option.id !== 'delete');

    return options as ConnectDropdownMenuItem[];
};

export default function DriveContainer(props: DriveContainerProps) {
    const { disableHoverStyles = false, setDisableHoverStyles } = props;
    const actions = useItemActions();
    const { t } = useTranslation();
    const { config } = useFeatureFlag();
    const { drives: drivesConfig } = config;

    const { addDrive, addRemoteDrive } = useDocumentDriveServer();
    const { onItemOptionsClick, onItemClick, onSubmitInput } =
        useDrivesContainer();

    const onDropEvent = useOnDropEvent();

    const cancelInputHandler: DriveViewProps['onCancelInput'] = item => {
        if (item.action === 'UPDATE') {
            actions.setItemAction(item.id, null);
            return;
        }

        actions.deleteVirtualItem(item.id);
    };

    const onDragStartHandler: DriveViewProps['onDragStart'] = () =>
        setDisableHoverStyles?.(true);

    const onDragEndHandler: DriveViewProps['onDragEnd'] = () =>
        setDisableHoverStyles?.(false);

    const onDropActivateHandler: DriveViewProps['onDropActivate'] =
        droptarget => {
            actions.setExpandedItem(droptarget.id, true);
        };

    const onCreateDriveHandler: DriveViewProps['onCreateDrive'] =
        async input => {
            try {
                if (isRemoteDriveInput(input)) {
                    await addRemoteDrive(input.url, {
                        sharingType: input.sharingType,
                        availableOffline: input.availableOffline,
                        listeners: [
                            {
                                block: true,
                                callInfo: {
                                    data: input.url,
                                    name: 'switchboard-push',
                                    transmitterType: 'SwitchboardPush',
                                },
                                filter: {
                                    branch: ['main'],
                                    documentId: ['*'],
                                    documentType: ['*'],
                                    scope: ['global'],
                                },
                                label: 'Switchboard Sync',
                                listenerId: '1',
                                system: true,
                            },
                        ],
                        triggers: [],
                        pullInterval: 3000,
                    });
                } else {
                    await addDrive({
                        global: {
                            id: isRemoteDriveInput(input) ? input.id : '',
                            icon: null,
                            name: input.driveName,
                            slug: null,
                        },
                        local: {
                            availableOffline: input.availableOffline,
                            sharingType: input.sharingType.toLowerCase(),
                            listeners: isRemoteDriveInput(input)
                                ? [
                                      {
                                          block: true,
                                          callInfo: {
                                              data: input.url,
                                              name: 'switchboard-push',
                                              transmitterType:
                                                  'SwitchboardPush',
                                          },
                                          filter: {
                                              branch: ['main'],
                                              documentId: ['*'],
                                              documentType: ['*'],
                                              scope: ['global'],
                                          },
                                          label: 'Switchboard Sync',
                                          listenerId: '1',
                                          system: true,
                                      },
                                  ]
                                : [],
                            triggers: [],
                        },
                    });
                }

                toast(t('notifications.addDriveSuccess'), {
                    type: 'connect-success',
                });
            } catch (e) {
                console.error(e);
            }
        };

    return (
        <>
            {DriveSections.map(drive => (
                <DriveView
                    {...drive}
                    key={drive.name}
                    disableAddDrives={
                        !getDrivesConfig(drive.key, drivesConfig).allowAdd
                    }
                    defaultItemOptions={getDriveOptions(
                        drive.key,
                        drivesConfig,
                    )}
                    onItemClick={onItemClick}
                    onItemOptionsClick={onItemOptionsClick}
                    onSubmitInput={item => onSubmitInput(item)}
                    onCancelInput={cancelInputHandler}
                    onDragStart={onDragStartHandler}
                    onDragEnd={onDragEndHandler}
                    onDropEvent={onDropEvent}
                    onDropActivate={onDropActivateHandler}
                    onCreateDrive={onCreateDriveHandler}
                    disableHighlightStyles={disableHoverStyles}
                />
            ))}
        </>
    );
}
