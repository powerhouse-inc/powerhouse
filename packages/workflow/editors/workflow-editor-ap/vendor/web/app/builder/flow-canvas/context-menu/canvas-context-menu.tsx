// ph-stub: upstream renders a radix context menu with run/copy/paste actions;
// the vendored builder has no context menu.
import { type ReactNode } from 'react';

export type CanvasShortcutsProps = Record<string, { label: string }>;

export enum ContextMenuType {
  CANVAS = 'CANVAS',
  STEP = 'STEP',
}

export type CanvasContextMenuProps = {
  contextMenuType: ContextMenuType;
  children?: ReactNode;
};

export const CanvasContextMenu = ({ children }: CanvasContextMenuProps) => {
  return <>{children}</>;
};
