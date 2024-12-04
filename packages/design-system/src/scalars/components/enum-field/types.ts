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

export interface SelectProps {
  options?: {
    icon?: IconName | React.ComponentType<{ className?: string }>;
    value: string;
    label: string;
    disabled?: boolean;
  }[];
  optionsCheckmark?: "Auto" | "None";
  placeholder?: string;
  maxSelectedOptionsToShow?: number;
  multiple?: boolean;
  searchable?: boolean;
  searchPosition?: "Dropdown" | "Input";
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
