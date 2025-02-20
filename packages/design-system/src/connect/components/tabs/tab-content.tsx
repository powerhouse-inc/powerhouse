import { ReactNode } from "react";

type Props = {
  readonly label: ReactNode;
  readonly description: ReactNode;
  readonly children: ReactNode;
  readonly disabled?: boolean;
};
export function TabContent(props: Props) {
  const { label, children } = props;

  return <div>{children}</div>;
}
