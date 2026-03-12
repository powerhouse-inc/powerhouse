import {
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
} from "react";

type AnyProps = Record<string, unknown>;

function mergeProps(parentProps: AnyProps, childProps: AnyProps): AnyProps {
  const merged: AnyProps = { ...parentProps };

  for (const key of Object.keys(childProps)) {
    const parentValue = parentProps[key];
    const childValue = childProps[key];

    if (key === "style") {
      merged[key] = { ...(parentValue as object), ...(childValue as object) };
    } else if (key === "className") {
      merged[key] = [parentValue, childValue].filter(Boolean).join(" ");
    } else if (
      typeof parentValue === "function" &&
      typeof childValue === "function"
    ) {
      merged[key] = (...args: unknown[]) => {
        (childValue as (...a: unknown[]) => void)(...args);
        (parentValue as (...a: unknown[]) => void)(...args);
      };
    } else if (childValue !== undefined) {
      merged[key] = childValue;
    }
  }

  return merged;
}

interface SlotProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

export const Slot = forwardRef<HTMLElement, SlotProps>(
  ({ children, ...props }, ref) => {
    const child = Children.only(children);

    if (!isValidElement(child)) {
      return null;
    }

    const childElement = child as ReactElement<AnyProps>;
    const mergedProps = mergeProps(props, childElement.props);

    if (ref) {
      mergedProps.ref = ref;
    }

    return cloneElement(childElement, mergedProps);
  },
);

Slot.displayName = "Slot";
