import { NodeInput } from "@/connect";
import { Icon } from "@/powerhouse";
import { useState } from "react";

export type BreadcrumbNode = {
  id: string;
  name: string;
};

export type BreadcrumbsProps = {
  breadcrumbs: BreadcrumbNode[];
  onBreadcrumbSelected: (node: BreadcrumbNode) => void;
} & (
  | { createEnabled: true; onCreate: (name: string) => void }
  | { createEnabled: false }
);

export function Breadcrumbs(props: BreadcrumbsProps) {
  const { breadcrumbs, createEnabled, onBreadcrumbSelected } = props;
  const [isCreating, setIsCreating] = useState(false);

  function onAddNew() {
    setIsCreating(true);
  }

  function onSubmit(name: string) {
    if (!createEnabled) return;
    props.onCreate(name);
    setIsCreating(false);
  }

  function onCancel() {
    setIsCreating(false);
  }

  return (
    <div className="flex h-9 flex-row items-center gap-2 p-6 text-gray-500">
      {breadcrumbs.map((node) => (
        <Breadcrumb key={node.id} node={node} onClick={onBreadcrumbSelected} />
      ))}
      {createEnabled && (
        <>
          {isCreating ? (
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
      )}
    </div>
  );
}

export type BreadcrumbProps = {
  node: BreadcrumbNode;
  onClick: (node: BreadcrumbNode) => void;
};

export function Breadcrumb(props: BreadcrumbProps) {
  const { node, onClick } = props;

  return (
    <>
      <div
        className="transition-colors last-of-type:text-gray-800 hover:text-gray-800"
        onClick={() => onClick(node)}
        role="button"
      >
        {node.name}
      </div>
      /
    </>
  );
}
