import { UI_NODE } from "@powerhousedao/design-system";
import type { Node } from "document-drive";
import type { DragEvent } from "react";
import { useCallback, useMemo, useState } from "react";

type Props = {
  node: Node;
};
export function useDrag(props: Props) {
  const { node } = props;
  const [isDragging, setIsDragging] = useState(false);

  const onDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.setData(UI_NODE, JSON.stringify(node));
    },
    [node],
  );

  const onDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  return useMemo(() => {
    return {
      isDragging,
      dragProps: {
        draggable: true,
        onDragStart,
        onDragEnd,
      },
    };
  }, [isDragging, onDragEnd, onDragStart]);
}
