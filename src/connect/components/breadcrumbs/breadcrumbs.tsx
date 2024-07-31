import { NodeInput, NodeProps, TUiNodesContext, UiNode } from '@/connect';
import { Icon } from '@/powerhouse';
import { useState } from 'react';

export type BreadcrumbsProps = NodeProps & TUiNodesContext;

export function Breadcrumbs(props: BreadcrumbsProps) {
    const {
        selectedNodePath,
        isAllowedToCreateDocuments,
        onAddAndSelectNewFolder,
    } = props;
    const [isAddingNewItem, setIsAddingNewFolder] = useState(false);

    function onAddNew() {
        setIsAddingNewFolder(true);
    }

    async function onSubmit(name: string) {
        await onAddAndSelectNewFolder(name);
        setIsAddingNewFolder(false);
    }

    function onCancel() {
        setIsAddingNewFolder(false);
    }

    return (
        <div className="flex h-9 flex-row items-center gap-2 p-6 text-gray-500">
            {selectedNodePath.map(node => (
                <Breadcrumb {...props} key={node.id} node={node} />
            ))}
            <>
                {isAllowedToCreateDocuments && (
                    <>
                        {isAddingNewItem ? (
                            <NodeInput
                                defaultValue="New Folder"
                                placeholder="New Folder"
                                className="text-gray-800"
                                onSubmit={onSubmit}
                                onCancel={onCancel}
                            />
                        ) : (
                            <button
                                onClick={onAddNew}
                                className="ml-1 flex items-center justify-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 transition-colors hover:bg-gray-200 hover:text-gray-800"
                            >
                                <Icon name="Plus" size={14} />
                                Add new
                            </button>
                        )}
                    </>
                )}
            </>
        </div>
    );
}

export type BreadcrumbProps = BreadcrumbsProps & {
    node: UiNode;
};

export function Breadcrumb(props: BreadcrumbProps) {
    const { node, setSelectedNode } = props;

    return (
        <>
            <div
                role="button"
                className="transition-colors last-of-type:text-gray-800 hover:text-gray-800"
                onClick={() => setSelectedNode(node)}
            >
                {node.name}
            </div>
            /
        </>
    );
}
