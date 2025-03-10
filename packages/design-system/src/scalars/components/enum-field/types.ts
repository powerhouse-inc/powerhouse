import type { IconName } from "#powerhouse";

export interface RadioGroupProps {
  options?: {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
  }[];
  onChange?: (value: string) => void;
}

export interface SelectOption {
  icon?: IconName | React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectBaseProps {
  options?: SelectOption[];
  placeholder?: string;
  multiple?: boolean;
  searchable?: boolean;
  onChange?: (value: string | string[]) => void;
}

export type SelectProps =
  | (SelectBaseProps & {
      selectionIcon?: "auto";
      selectionIconPosition?: "left";
    })
  | (SelectBaseProps & {
      selectionIcon: "checkmark";
      selectionIconPosition?: "left" | "right";
    });

export type EnumProps =
  | ({
      variant?: "auto";
    } & (RadioGroupProps | SelectProps))
  | ({
      variant: "RadioGroup";
    } & RadioGroupProps)
  | ({
      variant: "Select";
    } & SelectProps);
