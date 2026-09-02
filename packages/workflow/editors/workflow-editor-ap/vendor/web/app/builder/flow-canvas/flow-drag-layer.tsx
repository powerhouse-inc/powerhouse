// ph-stub: upstream uses @dnd-kit for step dragging; the vendored builder
// renders children only (drag-to-move is not supported).
const FlowDragLayer = ({
  children,
}: {
  children: React.ReactNode;
  cursorPosition?: { x: number; y: number };
}) => {
  return <>{children}</>;
};

export { FlowDragLayer };
