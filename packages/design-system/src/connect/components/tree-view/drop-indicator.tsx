import { type NodeProps, type UiNode, useDrop } from "@/connect";
import { type TUiNodesContext } from "@powerhousedao/reactor-browser";
import { twMerge } from "tailwind-merge";

type Props = TUiNodesContext &
  NodeProps & {
    readonly uiNode: UiNode;
    readonly position: "before" | "after";
    readonly className?: string;
  };

export function DropIndicator(props: Props) {
  const { uiNode, position, className, getParentNode } = props;
  const parentNode = getParentNode(uiNode);
  const { isDropTarget, dropProps } = useDrop({
    ...props,
    uiNode: parentNode,
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
