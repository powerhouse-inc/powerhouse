import {
    AddDriveInput,
    AddPublicDriveInput,
    DriveView,
    DriveViewProps,
    toast,
    useItemActions,
} from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useIsAllowedToCreateDocuments } from 'src/hooks/useIsAllowedToCreateDocuments';
import { useOnDropEvent } from 'src/hooks/useOnDropEvent';
import { driveSections } from 'src/utils/drive-sections';

interface DriveContainerProps {
    disableHoverStyles?: boolean;
    setDisableHoverStyles?: (value: boolean) => void;
}

function isRemoteDriveInput(
    input: AddDriveInput | AddPublicDriveInput,
): input is AddPublicDriveInput {
    return Object.keys(input).includes('url');
}

export default function DriveContainer(props: DriveContainerProps) {
    const { disableHoverStyles = false, setDisableHoverStyles } = props;
    const actions = useItemActions();
    const { t } = useTranslation();

    const { addDrive, addRemoteDrive } = useDocumentDriveServer();
    const { onItemOptionsClick, onItemClick, onSubmitInput } =
        useDrivesContainer();
    const isAllowedToCreateDocuments = useIsAllowedToCreateDocuments();

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
            {driveSections.map(
                ({ type, defaultItemOptions, disableAddDrives, key, name }) => (
                    <DriveView
                        key={key}
                        name={name}
                        type={type}
                        disableAddDrives={disableAddDrives}
                        defaultItemOptions={defaultItemOptions}
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
                        isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                    />
                ),
            )}
        </>
    );
}
