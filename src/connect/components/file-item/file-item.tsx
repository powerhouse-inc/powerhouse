import {
    ADD_INVALID_TRIGGER,
    ADD_TRIGGER,
    ConnectDropdownMenu,
    DELETE,
    DropdownMenuHandlers,
    DUPLICATE,
    FILE,
    getDocumentIconSrc,
    NodeInput,
    NodeOption,
    nodeOptionsMap,
    NodeProps,
    READ,
    REMOVE_TRIGGER,
    RENAME,
    TUiNodesContext,
    UiFileNode,
    useDrag,
    WRITE,
} from '@/connect';
import { Icon } from '@/powerhouse';
import { useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { SyncStatusIcon } from '../status-icon';

export type FileItemProps = TUiNodesContext &
    NodeProps & {
        uiNode: UiFileNode;
        customDocumentIconSrc?: string;
        className?: string;
    };

export function FileItem(props: FileItemProps) {
    const {
        uiNode,
        selectedNodePath,
        nodeOptions,
        isAllowedToCreateDocuments,
        isRemoteDrive,
        customDocumentIconSrc,
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

    const isReadMode = mode === READ;

    const containerStyles = twMerge(
        'group flex h-12 cursor-pointer select-none items-center rounded-lg bg-gray-200 px-2 text-gray-600 hover:text-gray-800',
        className,
    );

    const dropdownMenuHandlers: DropdownMenuHandlers = {
        [DUPLICATE]: () => onDuplicateNode(uiNode),
        [RENAME]: () => setMode(WRITE),
        [DELETE]: () => onDeleteNode(uiNode),
        [ADD_TRIGGER]: () => onAddTrigger(uiNode.driveId),
        [REMOVE_TRIGGER]: () => onRemoveTrigger(uiNode.driveId),
        [ADD_INVALID_TRIGGER]: () => onAddInvalidTrigger(uiNode.driveId),
    } as const;

    const nodeOptionsForKind = nodeOptions[uiNode.sharingType][FILE];

    const dropdownMenuOptions = Object.entries(nodeOptionsMap)
        .map(([id, option]) => ({
            ...option,
            id: id as NodeOption,
        }))
        .filter(option => nodeOptionsForKind.includes(option.id));

    function onSubmit(name: string) {
        onRenameNode(name, uiNode);
        setMode(READ);
    }

    function onCancel() {
        setMode(READ);
    }

    function onClick() {
        setSelectedNode(uiNode);
    }

    function onDropdownMenuOptionClick(itemId: NodeOption) {
        const handler = dropdownMenuHandlers[itemId];
        if (!handler) {
            console.error(`No handler found for dropdown menu item: ${itemId}`);
            return;
        }
        handler(uiNode);
        setIsDropdownMenuOpen(false);
    }

    const iconSrc = getDocumentIconSrc(
        uiNode.documentType,
        customDocumentIconSrc,
    );

    const iconNode = (
        <div className="relative">
            <img
                src={iconSrc}
                alt="file icon"
                className="max-w-none"
                width={32}
                height={34}
            />
            {isReadMode && isRemoteDrive && uiNode.syncStatus && (
                <div className="absolute bottom-[-2px] right-0 size-3 rounded-full bg-white">
                    <div className="absolute left-[-2px] top-[-2px]">
                        <SyncStatusIcon
                            syncStatus={uiNode.syncStatus}
                            overrideSyncIcons={{ SUCCESS: 'CheckCircleFill' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );

    const content = isReadMode ? (
        <div className="flex w-52 items-center justify-between">
            <div className="mr-2 truncate group-hover:mr-0">
                <div className="max-h-6 truncate text-sm font-medium group-hover:text-gray-800">
                    {uiNode.name}
                </div>
                <div className="max-h-6 truncate text-xs font-medium text-gray-600 group-hover:text-gray-800">
                    {selectedNodePath.map(node => node.name).join(' / ')}
                </div>
            </div>
            {isAllowedToCreateDocuments && (
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
                            'hidden group-hover:block',
                            isDropdownMenuOpen && 'block',
                        )}
                    >
                        <Icon name="VerticalDots" className="text-gray-600" />
                    </button>
                </ConnectDropdownMenu>
            )}
        </div>
    ) : (
        <NodeInput
            className="ml-3 flex-1 font-medium"
            defaultValue={uiNode.name}
            onCancel={onCancel}
            onSubmit={onSubmit}
        />
    );

    return (
        <div onClick={onClick} className="relative w-64">
            <div {...dragProps} className={containerStyles}>
                <div className="flex items-center">
                    <div className="mr-1.5">{iconNode}</div>
                    {content}
                </div>
            </div>
        </div>
    );
}
