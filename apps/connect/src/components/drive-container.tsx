import {
    AddDriveInput,
    AddLocalDriveInput,
    AddPublicDriveInput,
    AddRemoteDriveInput,
    DriveView,
    DriveViewProps,
    toast,
    useItemActions,
} from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useOnDropEvent } from 'src/hooks/useOnDropEvent';
import { useUserPermissions } from 'src/hooks/useUserPermissions';
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
    const { isAllowedToCreateDocuments } = useUserPermissions();
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

    async function onAddLocalDrive(data: AddLocalDriveInput) {
        try {
            await addDrive({
                global: {
                    name: data.name,
                    id: undefined,
                    icon: null,
                    slug: null,
                },
                local: {
                    availableOffline: data.availableOffline,
                    sharingType: data.sharingType.toLowerCase(),
                    listeners: [],
                    triggers: [],
                },
            });

            toast(t('notifications.addDriveSuccess'), {
                type: 'connect-success',
            });
        } catch (e) {
            console.error(e);
        }
    }

    async function onAddRemoteDrive(data: AddRemoteDriveInput) {
        try {
            await addRemoteDrive(data.url, {
                sharingType: data.sharingType,
                availableOffline: data.availableOffline,
                listeners: [
                    {
                        block: true,
                        callInfo: {
                            data: data.url,
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

            toast(t('notifications.addDriveSuccess'), {
                type: 'connect-success',
            });
        } catch (e) {
            console.error(e);
        }
    }

    return (
        <>
            {driveSections.map(
                ({ type, defaultItemOptions, disableAddDrives, key, name }) => (
                    <DriveView
                        key={key}
                        name={name}
                        type={type}
                        displaySyncFolderIcons
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
