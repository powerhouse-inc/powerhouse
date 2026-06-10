import { Icon } from "#design-system";
import { useTheme } from "@powerhousedao/reactor-browser";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type {
  ClearIndicatorProps,
  DropdownIndicatorProps,
  MenuListProps,
} from "react-select";
import Select, { components } from "react-select";

type SelectProps = ComponentPropsWithoutRef<typeof Select>;

type Props = Omit<SelectProps, "components" | "styles" | "theme"> & {
  readonly addItemButtonProps?: {
    label?: ReactNode;
    onClick?: () => void;
  };
};

function DropdownIndicator(props: DropdownIndicatorProps) {
  return (
    <components.DropdownIndicator {...props}>
      <Icon name="ChevronDown" size={16} />
    </components.DropdownIndicator>
  );
}

function ClearIndicator(props: ClearIndicatorProps) {
  return (
    <components.ClearIndicator {...props}>
      <Icon name="Xmark" size={16} />
    </components.ClearIndicator>
  );
}

function MenuList(
  props: MenuListProps & {
    readonly label?: ReactNode;
    readonly onClick?: () => void;
  },
) {
  const { label, onClick, ...rest } = props;

  const hasAddItemButton = !!label && !!onClick;

  return (
    <components.MenuList {...rest}>
      {props.children}
      {hasAddItemButton ? (
        <button
          className="w-full px-2 py-3 hover-hover"
          onClick={onClick}
        >
          {label}
        </button>
      ) : null}
    </components.MenuList>
  );
}

export function Combobox(props: Props) {
  const invalid = props["aria-invalid"] === "true";
  const { addItemButtonProps, ...rest } = props;
  const { theme } = useTheme();
  const dark = theme === "dark";

  return (
    <Select
      {...rest}
      components={{
        DropdownIndicator,
        ClearIndicator,
        MenuList: (menuListProps) =>
          MenuList({ ...menuListProps, ...addItemButtonProps }),
      }}
      classNames={{
        menuList: () =>
          "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-rounded-md scrollbar-thumb-gray-300 dark:scrollbar-thumb-slate-600",
      }}
      styles={{
        dropdownIndicator: () => {
          return {
            label: "indicatorContainer",
            display: "flex",
            transition: "color 150ms",
            color: dark ? "var(--color-slate-50)" : "var(--color-gray-900)",
            padding: 8,
            boxSizing: "border-box",
          };
        },
        clearIndicator: (baseStyles) => {
          return {
            ...baseStyles,
            color: dark ? "var(--color-slate-50)" : "var(--color-gray-900)",
          };
        },
        container: (baseStyles) => {
          return {
            ...baseStyles,
            borderColor: dark
              ? "var(--color-slate-700)"
              : "var(--color-gray-200)",
            fontSize: 12,
          };
        },
        placeholder: (baseStyles) => {
          return {
            ...baseStyles,
            color: invalid
              ? dark
                ? "var(--color-red-400)"
                : "var(--color-red-800)"
              : dark
                ? "var(--color-slate-100)"
                : "var(--color-gray-500)",
          };
        },
        control: () => {
          return {
            label: "control",
            alignItems: "center",
            cursor: "default",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            minHeight: 32,
            outline: "0 !important",
            position: "relative",
            transition: "all 100ms",
            backgroundColor: dark
              ? "var(--color-slate-800)"
              : "var(--color-white)",
            borderColor: invalid
              ? dark
                ? "var(--color-red-400)"
                : "var(--color-red-900)"
              : dark
                ? "var(--color-slate-600)"
                : "var(--color-gray-200)",
            borderStyle: "solid",
            borderWidth: 1,
            borderRadius: "6px",
            boxSizing: "border-box",
          };
        },
        option: (baseStyles, state) => {
          return {
            ...baseStyles,
            backgroundColor: state.isSelected
              ? dark
                ? "var(--color-slate-700)"
                : "var(--color-slate-50)"
              : dark
                ? "var(--color-slate-800)"
                : "var(--color-white)",
            color: dark ? "var(--color-slate-50)" : "var(--color-gray-800)",
            ":hover": {
              backgroundColor: dark
                ? "var(--color-slate-700)"
                : "var(--color-slate-50)",
            },
          };
        },
        menuList: (baseStyles) => ({
          ...baseStyles,
          padding: 0,
          borderRadius: "6px",
        }),
      }}
      theme={(theme) => ({
        ...theme,
        colors: {
          ...theme.colors,
          primary: dark ? "var(--color-slate-700)" : "var(--color-slate-100)",
          primary25: dark ? "var(--color-slate-800)" : "var(--color-slate-50)",
          primary50: dark ? "var(--color-slate-700)" : "var(--color-slate-100)",
          primary75: dark ? "var(--color-slate-700)" : "var(--color-slate-100)",
          danger: dark ? "var(--color-red-400)" : "var(--color-red-900)",
          dangerLight: dark ? "var(--color-red-900)" : "var(--color-red-100)",
          neutral0: dark ? "var(--color-slate-800)" : "var(--color-white)",
          neutral5: dark ? "var(--color-slate-800)" : "var(--color-gray-50)",
          neutral10: dark ? "var(--color-slate-700)" : "var(--color-gray-100)",
          neutral20: dark ? "var(--color-slate-600)" : "var(--color-gray-200)",
          neutral30: dark ? "var(--color-slate-600)" : "var(--color-gray-300)",
          neutral40: dark ? "var(--color-slate-400)" : "var(--color-gray-400)",
          neutral50: dark ? "var(--color-slate-300)" : "var(--color-gray-500)",
          neutral60: dark ? "var(--color-slate-200)" : "var(--color-gray-600)",
          neutral70: dark ? "var(--color-slate-100)" : "var(--color-gray-700)",
          neutral80: dark ? "var(--color-slate-50)" : "var(--color-gray-800)",
          neutral90: dark ? "var(--color-slate-50)" : "var(--color-gray-900)",
        },
      })}
    />
  );
}
