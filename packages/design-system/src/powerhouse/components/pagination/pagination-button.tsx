import { twMerge } from "tailwind-merge";
import { mergeClassNameProps } from "../../utils/mergeClassNameProps.js";
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
  const className = twMerge(
    "h-8 min-w-8 border border-solid border-gray-300 bg-white px-3 py-1 text-xs text-gray-900 hover:bg-gray-100",
    !active && "border-0",
  );

  return (
    <PowerhouseButton
      color="light"
      size="small"
      {...mergeClassNameProps(props, className)}
    >
      {props.children}
    </PowerhouseButton>
  );
};
