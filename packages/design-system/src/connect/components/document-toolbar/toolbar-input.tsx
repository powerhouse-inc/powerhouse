import { twMerge } from "tailwind-merge";
import { NodeInput } from "../node-input/node-input.js";

/**
 * Text input styled for use inside a toolbar.
 *
 * This wraps `NodeInput` with toolbar-specific text styling. Use it for inline
 * toolbar editing flows where the user can submit a value or cancel editing.
 */
export function ToolbarInput(props: {
  /**
   * Initial value to show in the input.
   */
  defaultValue?: string;
  /**
   * Additional CSS class names to apply to the input.
   */
  className?: string;
  /**
   * Accessible label for the input.
   */
  "aria-label"?: string;
  /**
   * Called when the user submits the input value.
   */
  onSubmit: (value: string) => void;
  /**
   * Called when the user cancels editing.
   */
  onCancel: () => void;
}) {
  const {
    defaultValue,
    className,
    onSubmit,
    onCancel,
    "aria-label": ariaLabel,
  } = props;
  return (
    <NodeInput
      defaultValue={defaultValue}
      className={twMerge(
        "text-center text-sm font-medium text-gray-500",
        className,
      )}
      aria-label={ariaLabel}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );
}
