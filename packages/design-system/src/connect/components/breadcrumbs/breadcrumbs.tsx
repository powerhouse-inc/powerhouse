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
            {isAllowedToCreateDocuments ? (
                <>
                    {isAddingNewItem ? (
                        <NodeInput
                            className="text-gray-800"
                            defaultValue="New Folder"
                            onCancel={onCancel}
                            onSubmit={onSubmit}
                            placeholder="New Folder"
                        />
                    ) : (
                        <button
                            className="ml-1 flex items-center justify-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 transition-colors hover:bg-gray-200 hover:text-gray-800"
                            onClick={onAddNew}
                        >
                            <Icon name="Plus" size={14} />
                            Add new
                        </button>
                    )}
                </>
            ) : null}
        </div>
    );
}

export type BreadcrumbProps = BreadcrumbsProps & {
    readonly node: UiNode;
};

export function Breadcrumb(props: BreadcrumbProps) {
    const { node, setSelectedNode } = props;

    return (
        <>
            <div
                className="transition-colors last-of-type:text-gray-800 hover:text-gray-800"
                onClick={() => setSelectedNode(node)}
                role="button"
            >
                {node.name}
            </div>
            /
        </>
    );
}
