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
    "h-8 min-w-8 border border-solid border-gray-300 bg-gray-50 px-3 py-1 text-xs text-gray-800 hover:bg-gray-100 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100 dark:hover:bg-slate-700",
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
