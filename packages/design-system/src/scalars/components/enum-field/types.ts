import type { IconName } from "@/powerhouse/components/icon";

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

export interface SelectProps {
  options?: SelectOption[];
  optionsCheckmark?: "Auto" | "Checkmark";
  optionsCheckmarkPosition?: "Left" | "Right";
  placeholder?: string;
  multiple?: boolean;
  searchable?: boolean;
  onChange?: (value: string | string[]) => void;
}

export type EnumProps =
  | ({
      variant?: "Auto";
    } & (RadioGroupProps | SelectProps))
  | ({
      variant: "RadioGroup";
    } & RadioGroupProps)
  | ({
      variant: "Select";
    } & SelectProps);
