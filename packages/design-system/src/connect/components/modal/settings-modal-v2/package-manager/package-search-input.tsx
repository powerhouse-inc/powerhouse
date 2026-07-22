import { Icon } from "#design-system";
import { Input } from "#design-system/ui";
import { twMerge } from "tailwind-merge";

export type PackageSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Plain controlled search box shared by the Installed/Available tabs. It only
 * reports the query — filtering happens in the panels (client-side today, a
 * registry search endpoint later).
 */
export const PackageSearchInput: React.FC<PackageSearchInputProps> = (
  props,
) => {
  const { value, onChange, placeholder, disabled, className } = props;
  return (
    <div className={twMerge("relative", className)}>
      <Icon
        name="Search"
        size={14}
        className="absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pl-7"
      />
    </div>
  );
};
