import { Icon, fixedForwardRef } from "@/powerhouse";
import { type CSSProperties, type ForwardedRef, useState } from "react";
import { twJoin, twMerge } from "tailwind-merge";

export type SelectItem<TValue extends string> = {
  readonly value: TValue;
  readonly displayValue?: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly icon?: React.JSX.Element;
  readonly disabled?: boolean;
};

export type SelectProps<TValue extends string> = {
  items: readonly SelectItem<TValue>[];
  value: TValue;
  id: string;
  onChange: (value: TValue) => void;
  containerClassName?: string;
  menuClassName?: string;
  itemClassName?: string;
  borderRadius?: CSSProperties["borderRadius"];
  absolutePositionMenu?: boolean;
};

export const Select = fixedForwardRef(function Select<TValue extends string>(
  props: SelectProps<TValue>,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    items,
    value,
    id,
    onChange,
    containerClassName,
    menuClassName,
    itemClassName,
    absolutePositionMenu = false,
    borderRadius = "6px",
  } = props;
  const [showItems, setShowItems] = useState(false);
  const selectedItem = getItemByValue(value) ?? items[0];
  function onItemClick(item: SelectItem<TValue>) {
    if (item.disabled) return;
    onChange(item.value);
    setShowItems(false);
  }
  function getItemByValue(value: TValue) {
    return items.find((item) => item.value === value);
  }

  const itemsToShow = items.filter((item) => item.value !== value);

  return (
    <div
      className={twMerge(
        "border border-gray-200 bg-gray-50 text-gray-800 transition-[border-radius]",
        absolutePositionMenu && "relative",
        containerClassName,
      )}
      data-open={showItems}
      ref={ref}
      style={{
        borderRadius: borderRadius,
      }}
    >
      <div
        className={twMerge(
          "flex min-w-[360px] cursor-pointer items-center justify-between pr-3 text-gray-800 outline-none",
          menuClassName,
        )}
        id={id}
        onClick={() => setShowItems(!showItems)}
      >
        <ItemContainer {...selectedItem} className={itemClassName} />
        <Icon
          className={twJoin("transition", showItems ? "" : "-rotate-90")}
          name="ChevronDown"
        />
      </div>
      <div
        className={twMerge(
          "max-h-0 w-full overflow-hidden bg-inherit transition-[max-height] ease-in-out",
          showItems && "max-h-screen",
          absolutePositionMenu && "absolute",
        )}
        style={{
          borderRadius: `0 0 ${borderRadius} ${borderRadius}`,
        }}
      >
        {itemsToShow.map((item) => (
          <ItemContainer
            key={item.value}
            {...item}
            className={itemClassName}
            onItemClick={() => onItemClick(item)}
          />
        ))}
      </div>
    </div>
  );
});

function ItemContainer<TValue extends string>(
  props: SelectItem<TValue> & {
    readonly onItemClick?: () => void;
    readonly className?: string;
  },
) {
  const {
    className,
    disabled,
    onItemClick,
    icon,
    displayValue,
    value,
    description,
  } = props;

  return (
    <div
      className={twMerge(
        disabled ? "cursor-not-allowed text-gray-500" : "text-gray-800",
        "flex size-full cursor-pointer items-center gap-2 bg-inherit py-3 pl-3 text-start outline-none",
        className,
      )}
      onClick={onItemClick}
    >
      {icon}
      <div>
        <p className="capitalize text-inherit">
          {displayValue ?? value.toLowerCase()}
        </p>
        <p className="text-xs text-gray-600">{description}</p>
      </div>
    </div>
  );
}
