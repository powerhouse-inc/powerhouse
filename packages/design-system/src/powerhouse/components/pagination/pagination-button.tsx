import { Button, type ButtonProps, mergeClassNameProps } from "#powerhouse";

import { twMerge } from "tailwind-merge";

export interface PaginationButtonProps extends ButtonProps {
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
    <Button
      color="light"
      size="small"
      {...mergeClassNameProps(props, className)}
    >
      {props.children}
    </Button>
  );
};
