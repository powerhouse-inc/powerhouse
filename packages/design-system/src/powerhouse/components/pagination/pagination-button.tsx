import { twMerge } from "tailwind-merge";
import {
  PowerhouseButton,
  type PowerhouseButtonProps,
} from "../button/button.js";

export interface PaginationButtonProps extends PowerhouseButtonProps {
  readonly active?: boolean;
}

export const PaginationButton: React.FC<PaginationButtonProps> = ({
  active = false,
  ...props
}) => {
  const { className: propClassName, ...restProps } = props;
  const mergedClassName = twMerge(
    "h-8 min-w-8 border border-solid border-border bg-background px-3 py-1 text-xs text-foreground hover:hover-effect",
    !active && "border-0",
    typeof propClassName === "string" && propClassName,
  );

  return (
    <PowerhouseButton
      color="light"
      size="small"
      className={mergedClassName}
      {...restProps}
    >
      {props.children}
    </PowerhouseButton>
  );
};
