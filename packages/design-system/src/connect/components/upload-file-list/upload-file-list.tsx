import { Icon } from "#design-system";
import type { ComponentPropsWithoutRef } from "react";
import { useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";
import {
  type UploadFileItemProps,
  UploadFileItem,
} from "../upload-file-item/upload-file-item.js";
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
        "w-89.5 rounded-md border border-gray-100 bg-gray-50 p-4 shadow-charcoal dark:border-slate-800 dark:bg-slate-900",
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
          className="min-w-0 flex-1 text-left text-sm/4 font-medium text-gray-900 hover:opacity-80 dark:text-slate-50"
        >
          {computedTitle}
        </button>

        <div className="flex shrink-0 items-center gap-4">
          {/* Collapse / Expand Toggle */}
          <button
            type="button"
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            onClick={() => setIsCollapsed((v) => !v)}
            className="text-gray-900 hover:opacity-80 dark:text-slate-50"
          >
            <span
              className={twMerge(
                "inline-block size-4 transition-transform select-none",
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
              className="text-gray-900 hover:opacity-80 dark:text-slate-50"
            >
              <span className="inline-block size-4 select-none">
                <Icon name="XmarkLight" size={16} aria-hidden="true" />
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Body (collapsible) */}
      {!isCollapsed && (
        <div className="mt-4 flex max-h-[404px] flex-col gap-4 overflow-x-visible overflow-y-auto p-2">
          {items.map((item, idx) => (
            <UploadFileItem key={`${item.fileName}-${idx}`} {...item} />
          ))}
        </div>
      )}
    </div>
  );
}
