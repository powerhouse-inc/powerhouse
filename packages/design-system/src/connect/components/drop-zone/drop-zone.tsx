import { Icon } from "#powerhouse";
import type { Node } from "document-drive";
import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { useDrop } from "../../hooks/drag-and-drop/use-drop.js";
import { useUploadTracker } from "./use-upload-tracker.js";
import { type OnAddFileWithProgress } from "./utils.js";

export type DropZoneProps = ComponentPropsWithoutRef<"div"> & {
  readonly title?: string;
  readonly subtitle?: string;
  readonly node?: Node;
  readonly enable?: boolean;
  readonly children?: ReactNode;
  readonly onAddFile?: OnAddFileWithProgress;
  readonly onMoveNode?: (
    src: Node,
    target: Node | undefined,
  ) => Promise<void> | void;
  readonly onCopyNode?: (
    src: Node,
    target: Node | undefined,
  ) => Promise<void> | void;
};

export function DropZone(props: DropZoneProps) {
  const {
    title = "Drag your documents",
    subtitle = "to drop them in the currently selected folder.",
    node,
    enable = true,
    children,
    onAddFile,
    onMoveNode,
    onCopyNode,
    className,
    ...delegatedProps
  } = props;

  // Upload tracking with the new hook
  const { uploadsArray, uploadsCount, createUploadHandler } =
    useUploadTracker();

  // TODO: Remove this
  console.log("uploadsArray", uploadsArray);
  console.log("uploadsCount", uploadsCount);

  // Create the upload handler from the hook
  const handleAddFile = createUploadHandler(onAddFile) ?? (async () => {});

  const { isDropTarget, dropProps } = useDrop({
    node,
    onAddFile: handleAddFile,
    onMoveNode: onMoveNode ?? (async () => {}),
    onCopyNode: onCopyNode ?? (async () => {}),
    trackNestedDrag: true,
  });

  return (
    <div
      className={twMerge("relative", className)}
      {...(enable ? dropProps : {})}
      {...delegatedProps}
    >
      {children}

      {enable && isDropTarget && (
        <div className="fixed inset-0 z-[1000] flex min-h-screen w-screen items-center justify-center bg-black/50">
          <div className="rounded-[24px] bg-white p-6 shadow-[1px_4px_15px_rgba(74,88,115,0.25)]">
            <div className="relative flex h-[130px] w-[400px] flex-col items-center justify-start overflow-visible rounded-lg border border-dashed border-black px-4 py-6">
              <div className="text-center text-base leading-5 text-zinc-500">
                {title}
              </div>
              <div className="text-center text-base leading-5 text-zinc-500">
                {subtitle}
              </div>

              <span className="pointer-events-none absolute -bottom-16 left-1/2 z-10 -translate-x-1/2">
                <Icon name="DocumentIcons" size={144} aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
