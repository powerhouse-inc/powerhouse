import { type DivProps } from "@/powerhouse";
import type React from "react";

export interface SettingsRowProps extends Omit<DivProps, "title"> {
  readonly title?: React.ReactNode;
  readonly description: React.ReactNode;
}

export const SettingsRow: React.FC<SettingsRowProps> = (props) => {
  const { title, children, description, ...restProps } = props;

  return (
    <div {...restProps}>
      {title ? <h2 className="font-semibold">{title}</h2> : null}
      <div className="flex items-center justify-between gap-x-12 text-sm font-medium">
        <p>{description}</p>
        <div>{children}</div>
      </div>
    </div>
  );
};
