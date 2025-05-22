import { type UiNode, useDrop } from "#connect";
import { twMerge } from "tailwind-merge";

type Props = {
  uiNode: UiNode;
  position: "before" | "after";
  className?: string;
  onAddFile: (file: File, parentNode: UiNode | null) => Promise<void>;
  onMoveNode: (uiNode: UiNode, targetNode: UiNode) => Promise<void>;
  onCopyNode: (uiNode: UiNode, targetNode: UiNode) => Promise<void>;
  getParentNode: (uiNode: UiNode) => UiNode | null;
};

export function DropIndicator(props: Props) {
  const {
    uiNode,
    position,
    className,
    onAddFile,
    onMoveNode,
    onCopyNode,
    getParentNode,
  } = props;
  const parentNode = getParentNode(uiNode);
  const { isDropTarget, dropProps } = useDrop({
    uiNode: parentNode,
    onAddFile,
    onMoveNode,
    onCopyNode,
  });

  const positionStyle = position === "before" ? "top-0" : "bottom-0";

  return (
    <div
      {...dropProps}
      className={twMerge(
        "absolute left-0 z-10 flex h-0.5 w-full",
        positionStyle,
        isDropTarget && "bg-blue-800",
        className,
      )}
    />
  );
}
