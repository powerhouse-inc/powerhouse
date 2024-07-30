import {
    ADD_INVALID_TRIGGER,
    ADD_TRIGGER,
    ConnectDropdownMenu,
    DELETE,
    DropdownMenuHandlers,
    DUPLICATE,
    FOLDER,
    NodeInput,
    NodeOption,
    nodeOptionsMap,
    NodeProps,
    READ,
    REMOVE_TRIGGER,
    RENAME,
    SyncStatusIcon,
    TUiNodesContext,
    UiFolderNode,
    useDrag,
    useDrop,
    WRITE,
} from '@/connect';
import { Icon } from '@/powerhouse';
import { useState } from 'react';
import { twMerge } from 'tailwind-merge';

export type FolderItemProps = TUiNodesContext &
    NodeProps & {
        uiNode: UiFolderNode;
        className?: string;
    };

export function FolderItem(props: FolderItemProps) {
    const {
        uiNode,
        isAllowedToCreateDocuments,
        nodeOptions,
        isRemoteDrive,
        className,
        setSelectedNode,
        onRenameNode,
        onDuplicateNode,
        onDeleteNode,
        onAddTrigger,
        onRemoveTrigger,
        onAddInvalidTrigger,
    } = props;
    const [mode, setMode] = useState<typeof READ | typeof WRITE>(READ);
    const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
    const { dragProps } = useDrag(props);
    const { isDropTarget, dropProps } = useDrop(props);

    const isReadMode = mode === READ;

    function onCancel() {
        setMode(READ);
    }

    function onSubmit(name: string) {
        onRenameNode(name, uiNode);
    }

    function onClick() {
        setSelectedNode(uiNode);
    }

    const dropdownMenuHandlers: DropdownMenuHandlers = {
        [DUPLICATE]: () => onDuplicateNode(uiNode),
        [RENAME]: () => setMode(WRITE),
        [DELETE]: () => onDeleteNode(uiNode),
        [ADD_TRIGGER]: () => onAddTrigger(uiNode.driveId),
        [REMOVE_TRIGGER]: () => onRemoveTrigger(uiNode.driveId),
        [ADD_INVALID_TRIGGER]: () => onAddInvalidTrigger(uiNode.driveId),
    } as const;

    const nodeOptionsForKind = nodeOptions[uiNode.sharingType][FOLDER];

    const dropdownMenuOptions = Object.entries(nodeOptionsMap)
        .map(([id, option]) => ({
            ...option,
            id: id as NodeOption,
        }))
        .filter(option => nodeOptionsForKind.includes(option.id));

    function onDropdownMenuOptionClick(itemId: NodeOption) {
        const handler = dropdownMenuHandlers[itemId];
        if (!handler) {
            console.error(`No handler found for dropdown menu item: ${itemId}`);
            return;
        }
        handler();
        setIsDropdownMenuOpen(false);
    }

    const content =
        isReadMode || !isAllowedToCreateDocuments ? (
            <div className="ml-3 max-h-6 truncate font-medium text-slate-200">
                {uiNode.name}
            </div>
        ) : (
            <NodeInput
                className="ml-3 font-medium"
                defaultValue={uiNode.name}
                onCancel={onCancel}
                onSubmit={onSubmit}
            />
        );

    const textStyles = isReadMode
        ? 'text-gray-600 hover:text-gray-800'
        : 'text-gray-800';

    const containerStyles = twMerge(
        'group flex h-12 cursor-pointer select-none items-center rounded-lg bg-gray-200 px-2',
        textStyles,
        className,
        isDropTarget && 'bg-blue-100',
    );

    return (
        <div onClick={onClick} className="relative w-64">
            <div {...dragProps} {...dropProps} className={containerStyles}>
                <div className="flex items-center overflow-hidden">
                    <div className="p-1">
                        <div className="relative">
                            <Icon name="folder-close" size={24} />
                            {isReadMode &&
                                isRemoteDrive &&
                                uiNode.syncStatus && (
                                    <div className="absolute bottom-[-3px] right-[-2px] size-3 rounded-full bg-white">
                                        <div className="absolute left-[-2px] top-[-2px]">
                                            <SyncStatusIcon
                                                syncStatus={uiNode.syncStatus}
                                                overrideSyncIcons={{
                                                    SUCCESS:
                                                        'check-circle-fill',
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                        </div>
                    </div>
                    {content}
                </div>
                {isReadMode && isAllowedToCreateDocuments && (
                    <ConnectDropdownMenu
                        open={isDropdownMenuOpen}
                        onOpenChange={setIsDropdownMenuOpen}
                        onItemClick={onDropdownMenuOptionClick}
                        items={dropdownMenuOptions}
                    >
                        <button
                            onClick={e => {
                                e.stopPropagation();
                                setIsDropdownMenuOpen(true);
                            }}
                            className={twMerge(
                                'ml-auto hidden group-hover:block',
                                isDropdownMenuOpen && 'block',
                            )}
                        >
                            <Icon
                                name="vertical-dots"
                                className="text-gray-600"
                            />
                        </button>
                    </ConnectDropdownMenu>
                )}
            </div>
        </div>
    );
}
