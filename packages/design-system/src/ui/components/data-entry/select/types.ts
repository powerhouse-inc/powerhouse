import type { IconName } from "#powerhouse";
import type { InputBaseProps } from "#scalars";
import type React from "react";

interface SelectOption {
  icon?: IconName | React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectBaseProps {
  options?: SelectOption[];
  favoriteOptions?: SelectOption[];
  placeholder?: string;
  multiple?: boolean;
  searchable?: boolean;
  onChange?: (value: string | string[]) => void;
  contentClassName?: string;
  contentAlign?: "start" | "end" | "center";
}

type SelectConfigProps =
  | (SelectBaseProps & {
      selectionIcon?: "auto";
      selectionIconPosition?: "left";
    })
  | (SelectBaseProps & {
      selectionIcon: "checkmark";
      selectionIconPosition?: "left" | "right";
    });

type SelectProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  keyof InputBaseProps<string | string[]> | keyof SelectConfigProps
> &
  InputBaseProps<string | string[]> &
  SelectConfigProps;

export type { SelectBaseProps, SelectOption, SelectProps };
