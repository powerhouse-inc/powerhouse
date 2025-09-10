import type { ReactNode } from "react";

export type TabContentProps = {
  readonly label: ReactNode;
  readonly description: ReactNode;
  readonly children: ReactNode;
  readonly disabled?: boolean;
};
export function TabContent(props: TabContentProps) {
  const { label, children } = props;

  return <div>{children}</div>;
}
