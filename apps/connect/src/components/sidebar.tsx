import {
    ConnectSidebar,
    DriveTreeItem,
    DriveView,
    ItemType,
    TreeItem,
} from '@powerhousedao/design-system';
import {
    DocumentDriveAction,
    DocumentDriveState,
    Drive,
    Node,
} from 'document-model-libs/document-drive';
import { Document } from 'document-model/document';
import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { sidebarCollapsedAtom, useTabs } from 'src/store';
import { useGetDocumentModel } from 'src/store/document-model';
import { loadFile } from 'src/utils/file';

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

export default function () {
    const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
    function toggleCollapse() {
        setCollapsed(value => !value);
    }
    const getDocumentModel = useGetDocumentModel();
    const { addTab, fromDocument } = useTabs();

    const [documentDrive, setDocumentDrive] = useState<Document<
        DocumentDriveState,
        DocumentDriveAction
    > | null>(null);

    useEffect(() => {
        window.electronAPI?.documentDrive().then(setDocumentDrive);
    }, []);

    async function openFile(path: string, drive: string) {
        const file = await window.electronAPI?.documentDriveOpen(path, drive);
        const document = await loadFile(await file, getDocumentModel);
        const tab = await fromDocument(document);
        addTab(tab);
    }

    function handleNodeClick(item: TreeItem, drive: DriveTreeItem) {
        if (item.type === ItemType.File) {
            openFile(item.id, drive.id);
        }
    }

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
                />
            )}
        </ConnectSidebar>
    );
}
