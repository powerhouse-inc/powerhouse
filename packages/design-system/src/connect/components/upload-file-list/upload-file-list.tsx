import { Icon } from "#powerhouse";
import { type ComponentPropsWithoutRef, useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";

import {
  UploadFileItem,
  type UploadFileItemProps,
} from "../upload-file-item/index.js";
import { getUploadListTitle } from "./utils.js";

export type UploadFileListProps = ComponentPropsWithoutRef<"div"> & {
  readonly items: ReadonlyArray<UploadFileItemProps>;
  readonly title?: string;
  readonly defaultCollapsed?: boolean;
  readonly onClose?: () => void;
};

export function UploadFileList(props: UploadFileListProps) {
  const {
    items,
    title,
    defaultCollapsed = false,
    onClose,
    className,
    ...delegatedProps
  } = props;

  const [isCollapsed, setIsCollapsed] = useState<boolean>(defaultCollapsed);

  const computedTitle = useMemo(
    () => getUploadListTitle(items.length, title),
    [items.length, title],
  );

  return (
    <div
      className={twMerge(
        "w-[358px] rounded-md border border-gray-100 bg-gray-50 p-4 shadow-[1px_4px_15px_rgba(74,88,115,0.25)]",
        className,
      )}
      {...delegatedProps}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand list" : "Collapse list"}
          onClick={() => setIsCollapsed((v) => !v)}
          className="min-w-0 flex-1 text-left text-sm font-medium leading-4 text-gray-900 hover:opacity-80"
        >
          {computedTitle}
        </button>

        <div className="flex shrink-0 items-center gap-4">
          {/* Collapse / Expand Toggle */}
          <button
            type="button"
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            onClick={() => setIsCollapsed((v) => !v)}
            className="text-gray-900 hover:opacity-80"
          >
            <span
              className={twMerge(
                "inline-block h-4 w-4 select-none transition-transform",
                isCollapsed ? "-rotate-90" : "rotate-0",
              )}
            >
              <Icon name="CaretDown" size={16} aria-hidden="true" />
            </span>
          </button>

          {/* Close Button */}
          {onClose && (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="text-gray-900 hover:opacity-80"
            >
              <span className="inline-block h-4 w-4 select-none">
                <Icon name="XmarkLight" size={16} aria-hidden="true" />
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Body (collapsible) */}
      {!isCollapsed && (
        <div className="mt-4 flex max-h-[404px] flex-col gap-4 overflow-y-auto overflow-x-visible px-2 py-2">
          {items.map((item, idx) => (
            <UploadFileItem key={`${item.fileName}-${idx}`} {...item} />
          ))}
        </div>
      )}
    </div>
  );
}
