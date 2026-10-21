import { Icon } from "#design-system";
import {
  showDeleteNodeModal,
  useDownloadFolder,
  useDragNode,
  useDropNode,
  useLinkProps,
  usePreloadNode,
  useSetSelectedNode,
  useNodeActions,
  useNodeTarget,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import { useConnectBranding } from "../branding/connect-branding.js";
import type { FolderNode } from "@powerhousedao/shared/document-drive";
import { useState } from "react";
import { addProp, entries, map, pipe } from "remeda";
import { twMerge } from "tailwind-merge";
import { folderNodeDropdownOptions } from "../../constants/options.js";
import { ConnectDropdownMenu } from "../dropdown-menu/dropdown-menu.js";
import { NodeInput } from "../node-input/node-input.js";

export function FolderItem(props: {
  folderNode: FolderNode;
  className?: string;
  /** The folder's link; the navigation's href for it by default. */
  href?: string;
}) {
  const { folderNode, className } = props;
  // The branding's folder icon; the built-in icon otherwise.
  const folderIconSrc = useConnectBranding().icons?.folder;
  const setSelectedNode = useSetSelectedNode();
  const preloadNode = usePreloadNode();
  const target = useNodeTarget(folderNode);
  const link = useLinkProps(target, () => setSelectedNode(folderNode));
  const href = props.href ?? (target ? link.href : undefined);
  const { isAllowedToCreateDocuments } = useUserPermissions();
  const [mode, setMode] = useState<"READ" | "WRITE">("READ");
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  const { isDragging, ...dragProps } = useDragNode({
    srcId: folderNode.id,
    parentId: folderNode.parentFolder,
  });
  const { isDropTarget, ...dropProps } = useDropNode(folderNode.id);
  const { onRenameNode, onRenameDriveNodes, onDuplicateNode } =
    useNodeActions();
  const isReadMode = mode === "READ";
  const downloadFolder = useDownloadFolder(folderNode);
  function onCancel() {
    setMode("READ");
  }

  function onSubmit(name: string) {
    Promise.all([
      onRenameNode(name, folderNode),
      onRenameDriveNodes(name, folderNode.id),
    ])
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => {
        setMode("READ");
      });
  }

  const dropdownMenuHandlers = {
    DOWNLOAD: downloadFolder,
    DUPLICATE: () => onDuplicateNode(folderNode),
    RENAME: () => setMode("WRITE"),
    DELETE: () => showDeleteNodeModal(folderNode),
  } as const;

  const dropdownMenuOptions = pipe(
    folderNodeDropdownOptions,
    entries(),
    map(([id, option]) => addProp(option, "id", id)),
  );

  function onDropdownMenuOptionClick(
    itemId: keyof typeof dropdownMenuHandlers,
  ) {
    const handler = dropdownMenuHandlers[itemId];
    if (!handler) {
      console.error(`No handler found for dropdown menu item: ${itemId}`);
      return;
    }
    void handler();
    setIsDropdownMenuOpen(false);
  }

  const content =
    isReadMode || !isAllowedToCreateDocuments ? (
      <div className="ml-3 max-h-6 truncate font-medium text-foreground group-hover:hover-effect">
        {folderNode.name}
      </div>
    ) : (
      <NodeInput
        className="ml-3 font-medium"
        defaultValue={folderNode.name}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    );

  const containerStyles = twMerge(
    "group flex h-12 cursor-pointer items-center rounded-lg bg-muted px-2 select-none",
    isDragging ? "opacity-60" : isDropTarget ? "bg-info/10" : "",
    className,
  );

  // A link only while reading: clicks in the rename input must not follow it.
  const isLink = isReadMode && !!href;
  const Element = isLink ? "a" : "div";

  return (
    <Element
      href={isLink ? href : undefined}
      aria-current={isLink ? link["aria-current"] : undefined}
      className="relative block w-64 hover:hover-effect"
      onClick={
        isLink
          ? link.onClick
          : isReadMode
            ? () => setSelectedNode(folderNode)
            : undefined
      }
      onMouseEnter={() => preloadNode(folderNode)}
      onTouchStart={() => preloadNode(folderNode)}
      onFocus={() => preloadNode(folderNode)}
    >
      <div {...dragProps} {...dropProps} className={containerStyles}>
        <div className="flex items-center overflow-hidden">
          <div className="p-1">
            <div className="relative text-foreground">
              {folderIconSrc ? (
                <img
                  alt="folder icon"
                  className="object-contain"
                  src={folderIconSrc}
                  width={24}
                  height={24}
                  draggable={false}
                />
              ) : (
                <Icon name="FolderClose" size={24} />
              )}
            </div>
          </div>
          {content}
        </div>
        {isReadMode && isAllowedToCreateDocuments ? (
          <ConnectDropdownMenu
            items={dropdownMenuOptions}
            onItemClick={onDropdownMenuOptionClick}
            onOpenChange={setIsDropdownMenuOpen}
            open={isDropdownMenuOpen}
          >
            <button
              className={twMerge(
                "ml-auto hidden group-hover:block",
                isDropdownMenuOpen && "block",
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDropdownMenuOpen(true);
              }}
            >
              <Icon className="text-foreground" name="VerticalDots" />
            </button>
          </ConnectDropdownMenu>
        ) : null}
      </div>
    </Element>
  );
}
