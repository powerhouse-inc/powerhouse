import type { ReactNode } from "react";

export type TabContentProps = {
  readonly label: ReactNode;
  /**
   * Stable tab value. Required when `label` is not a plain string (e.g. it
   * embeds a changing count) — Radix derives aria ids from it. Falls back to
   * the slugified label.
   */
  readonly value?: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly disabled?: boolean;
};
export function TabContent(props: TabContentProps) {
  const { label: _label, children } = props;

  return <div className="h-full">{children}</div>;
}
