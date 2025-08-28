import { Icon, NodeInput } from "@powerhousedao/design-system";
import { type Node } from "document-drive";
import { Fragment, useCallback, useState } from "react";

export type BreadcrumbsProps<T extends boolean = boolean> = {
  breadcrumbs: Node[];
  onBreadcrumbSelected: (node: Node) => void;
  createEnabled?: T;
  onCreate: T extends true
    ? (name: string, parentFolder: string | undefined) => void
    : never;
};

export function Breadcrumbs(props: BreadcrumbsProps) {
  const { breadcrumbs, createEnabled, onBreadcrumbSelected } = props;
  const [isCreating, setIsCreating] = useState(false);
  const onCreate = props.createEnabled ? props.onCreate : undefined;

  function onAddNew() {
    setIsCreating(true);
  }

  const onSubmit = useCallback(
    (name: string) => {
      if (!createEnabled || !onCreate) return;
      onCreate(name, breadcrumbs.at(-1)?.id);
      setIsCreating(false);
    },
    [breadcrumbs, createEnabled, onCreate],
  );

  const onCancel = useCallback(() => {
    setIsCreating(false);
  }, []);

  return (
    <div className="flex h-9 flex-row items-center gap-2 p-6 text-gray-500">
      {breadcrumbs.map((node) => (
        <Fragment key={node.id}>
          <Breadcrumb node={node} onClick={onBreadcrumbSelected} />
          <span>/</span>
        </Fragment>
      ))}
      {createEnabled &&
        (isCreating ? (
          <NodeInput
            className="text-gray-800"
            defaultValue="New Folder"
            onCancel={onCancel}
            onSubmit={onSubmit}
            placeholder="New Folder"
          />
        ) : (
          <button
            type="button"
            className="ml-1 flex items-center justify-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 transition-colors hover:bg-gray-200 hover:text-gray-800"
            onClick={onAddNew}
          >
            <Icon name="Plus" size={14} />
            Add new
          </button>
        ))}
    </div>
  );
}

export type BreadcrumbProps = {
  node: Node;
  onClick: (node: Node) => void;
};

export function Breadcrumb(props: BreadcrumbProps) {
  const { node, onClick } = props;

  return (
    <div
      className="transition-colors last-of-type:text-gray-800 hover:text-gray-800"
      onClick={() => onClick(node)}
      role="button"
    >
      {node.name}
    </div>
  );
}
