import { DRIVE, type NodeKind, UI_NODE_ID } from "#connect";
import { type DragEvent, useCallback, useMemo, useState } from "react";
type Props = {
  nodeId: string | null;
  nodeKind: NodeKind | null;
};
export function useDrag(props: Props) {
  const { nodeId, nodeKind } = props;
  const [isDragging, setIsDragging] = useState(false);
  const allowedToDragNode = !!nodeKind && nodeKind !== DRIVE;
  const onDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!nodeId) {
        return;
      }
      event.dataTransfer.setData(UI_NODE_ID, nodeId);
    },
    [nodeId],
  );

  const onDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

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
