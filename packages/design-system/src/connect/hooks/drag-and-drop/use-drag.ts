import { DRIVE, UI_NODE_ID } from "#connect";
import { useNodeKindForId } from "@powerhousedao/reactor-browser";
import { type DragEvent, useCallback, useMemo, useState } from "react";
type Props = {
  nodeId: string | null;
};
export function useDrag(props: Props) {
  const { nodeId } = props;
  const [isDragging, setIsDragging] = useState(false);
  const nodeKind = useNodeKindForId(nodeId);
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
