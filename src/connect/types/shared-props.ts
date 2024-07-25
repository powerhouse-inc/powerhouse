import {
    TNodeOptions,
    UiDriveNode,
    UiFileNode,
    UiFolderNode,
    UiNode,
} from '@/connect';
import { UseDraggableTargetProps } from '@/powerhouse';

export type UiNodeDraggableTargetProps = Pick<
    UseDraggableTargetProps<UiNode>,
    'onDragStart' | 'onDragEnd' | 'onDropEvent'
>;

export type DragAndDropProps = UiNodeDraggableTargetProps & {
    disableDropBetween: boolean;
    disableHighlightStyles: boolean;
    onDropActivate: (dropTargetItem: UiNode) => void;
};

export type NodeProps = {
    nodeOptions: TNodeOptions;
    isAllowedToCreateDocuments: boolean;
    isRemoteDrive: boolean;
    onAddFolder: (name: string, uiNode: UiNode) => void;
    onAddAndSelectNewFolder: (name: string) => Promise<void>;
    onRenameNode: (name: string, uiNode: UiNode) => void;
    onDuplicateNode: (uiNode: UiNode) => void;
    onDeleteNode: (uiNode: UiFileNode | UiFolderNode) => void;
    onDeleteDrive: (uiNode: UiDriveNode) => void;
    onAddTrigger: (uiNodeDriveId: string) => void;
    onRemoveTrigger: (uiNodeDriveId: string) => void;
    onAddInvalidTrigger: (uiNodeDriveId: string) => void;
};
