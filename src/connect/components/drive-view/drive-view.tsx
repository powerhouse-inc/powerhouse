import {
    ConnectTreeView,
    NodeProps,
    SharingType,
    TUiNodesContext,
    UiDriveNode,
} from '@/connect';
import { Icon } from '@/powerhouse';
import { ReactNode } from 'react';
import { twJoin, twMerge } from 'tailwind-merge';

export type DriveViewProps = TUiNodesContext &
    NodeProps & {
        label: ReactNode;
        groupSharingType: SharingType;
        disableAddDrives: boolean;
        className?: string;
        showAddDriveModal: (groupSharingType: SharingType) => void;
        showDriveSettingsModal: (uiDriveNode: UiDriveNode) => void;
    };

export function DriveView(props: DriveViewProps) {
    const {
        driveNodes,
        selectedDriveNode,
        label,
        groupSharingType,
        className,
        disableAddDrives,
        isAllowedToCreateDocuments,
        showAddDriveModal,
    } = props;
    const hasDriveNodes = driveNodes.length > 0;
    const isContainerHighlighted =
        selectedDriveNode?.sharingType === groupSharingType;

    function onShowAddDriveModal() {
        showAddDriveModal(groupSharingType);
    }

    return (
        <div
            className={twMerge(
                'border-y border-gray-100 pl-4 pr-1 first-of-type:border-b-0 last-of-type:border-t-0',
                hasDriveNodes && 'pb-2',
                isContainerHighlighted && 'bg-gray-100',
                className,
            )}
        >
            <div
                className={twJoin(
                    'flex items-center justify-between py-1.5 pr-2',
                )}
            >
                <p className="text-sm font-medium leading-6 text-gray-500">
                    {label}
                </p>
                <div className="size-4 text-gray-600">
                    {!disableAddDrives && isAllowedToCreateDocuments && (
                        <button
                            onClick={onShowAddDriveModal}
                            className={twMerge(
                                'mr-2 transition hover:text-gray-800',
                            )}
                        >
                            <Icon name="plus-circle" size={16} />
                        </button>
                    )}
                </div>
            </div>
            {driveNodes.map(driveNode => (
                <ConnectTreeView
                    {...props}
                    key={driveNode.id}
                    uiNode={driveNode}
                />
            ))}
        </div>
    );
}
