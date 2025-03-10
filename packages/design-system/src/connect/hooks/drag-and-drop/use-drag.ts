import { DRIVE, UI_NODE, type UiNode } from "@/connect";
import { type DragEvent, useCallback, useMemo, useState } from "react";

type Props = {
  uiNode: UiNode | null;
};
export function useDrag(props: Props) {
  const { uiNode } = props;
  const [isDragging, setIsDragging] = useState(false);

  const onDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.setData(UI_NODE, JSON.stringify(uiNode));
    },
    [uiNode],
  );

  const onDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const allowedToDragNode = !!uiNode && uiNode.kind !== DRIVE;

  return useMemo(() => {
    const dragProps = allowedToDragNode
      ? {
          draggable: true,
          onDragStart,
          onDragEnd,
        }
      : {
          draggable: false,
          onDragStart: undefined,
          onDragEnd: undefined,
        };

    return {
      isDragging,
      dragProps,
    };
  }, [allowedToDragNode, isDragging, onDragEnd, onDragStart]);
}
