// Shim for @dnd-kit/core: dragging steps is not supported, hooks are inert.
export interface DragMoveEvent {
  active: { id: string | number; rect: unknown };
  over: { id: string | number } | null;
  collisions: { id: string | number }[] | null;
}

export function useDraggable(_options: {
  id: string;
  disabled?: boolean;
  data?: unknown;
}): {
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  setNodeRef: (element: HTMLElement | null) => void;
  isDragging: boolean;
  transform: null;
} {
  return {
    attributes: {},
    listeners: undefined,
    setNodeRef: () => {},
    isDragging: false,
    transform: null,
  };
}

export function useDroppable(_options: { id: string; data?: unknown }): {
  setNodeRef: (element: HTMLElement | null) => void;
  isOver: boolean;
} {
  return { setNodeRef: () => {}, isOver: false };
}

export function useDndMonitor(_handlers: {
  onDragMove?: (event: DragMoveEvent) => void;
  onDragStart?: (event: unknown) => void;
  onDragEnd?: (event: unknown) => void;
  onDragCancel?: () => void;
}): void {}
