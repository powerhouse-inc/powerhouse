// Shim for the builder keyboard shortcuts (upstream wires copy/paste/delete
// bulk actions; not supported here).
export const useHandleKeyPressOnCanvas = (): void => {};

export const CanvasShortcuts: Record<string, { label: string }> = {};
