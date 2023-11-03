import {
    ConnectSidebar,
    DriveTreeItem,
    DriveView,
    ItemType,
    OnItemOptionsClickHandler,
    TreeItem,
} from '@powerhousedao/design-system';
import { Drive, Node } from 'document-model-libs/document-drive';
import { useAtom } from 'jotai';
import { useRef } from 'react';
import { useDrop } from 'react-aria';
import { FileDropItem } from 'react-aria-components';
import { useDocumentDrive } from 'src/hooks/useDocumentDrive';
import { sidebarCollapsedAtom } from 'src/store';

function mapDocumentDriveNodeToTreeItem(
    node: Node,
    allNodes: Node[]
): TreeItem {
    const isFolder = node.kind === 'folder';
    const pathRegex = new RegExp(`^${node.path}/[^/]+`);

    return {
        id: node.path,
        label: node.name,
        type: isFolder ? ItemType.Folder : ItemType.File,
        children: isFolder
            ? allNodes
                  .filter(childrenNode => pathRegex.test(childrenNode.path))
                  .map(childrenNode =>
                      mapDocumentDriveNodeToTreeItem(childrenNode, allNodes)
                  )
            : undefined,
    };
}

function mapDocumentDriveToTreeItem(drive: Drive): DriveTreeItem {
    return {
        id: drive.id,
        label: drive.name,
        type: ItemType.LocalDrive,
        expanded: true,
        children: drive.nodes
            .filter(node => !node.path.includes('/'))
            .map(node => mapDocumentDriveNodeToTreeItem(node, drive.nodes)),
    };
}

function DropTarget(onFileDropped: (file: File) => void) {
    const ref = useRef(null);
    const { dropProps, isDropTarget } = useDrop({
        ref,
        async onDrop(e) {
            const items = await Promise.all(
                (
                    e.items.filter(
                        item => item.kind === 'file'
                    ) as FileDropItem[]
                ).map((item: FileDropItem) => {
                    const file = item.getFile();
                })
            );
        },
    });

    return (
        <div
            {...dropProps}
            role="button"
            tabIndex={0}
            ref={ref}
            className={`droppable ${isDropTarget ? 'target' : ''}`}
        ></div>
    );
}

export default function () {
    const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
    function toggleCollapse() {
        setCollapsed(value => !value);
    }

    const { documentDrive, openFile, duplicateFile } = useDocumentDrive();

    function handleNodeClick(item: TreeItem, drive: DriveTreeItem) {
        if (item.type === ItemType.File) {
            openFile(item.id, drive.id);
        }
    }

    const handleItemOptionsClick: OnItemOptionsClickHandler = (
        item,
        option,
        drive
    ) => {
        switch (option) {
            case 'duplicate':
                if (item.type === ItemType.File) {
                    duplicateFile(item.id, drive.id);
                }
        }
    };

    return (
        <ConnectSidebar
            collapsed={collapsed}
            onToggle={toggleCollapse}
            username="Willow.eth"
            address="0x8343...3u432u32"
        >
            {documentDrive && (
                <DriveView
                    type="local"
                    name={documentDrive.name}
                    drives={documentDrive.state.drives.map(
                        mapDocumentDriveToTreeItem
                    )}
                    onItemClick={(_, item, drive) => {
                        handleNodeClick(item, drive);
                    }}
                    onItemOptionsClick={handleItemOptionsClick}
                />
            )}
        </ConnectSidebar>
    );
}
