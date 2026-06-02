import { twMerge } from "tailwind-merge";

type Props = {
  className?: string;
  size?: "sm" | "md" | "lg";
  margin?: "sm" | "md" | "lg";
};
export function Divider({ className, size = "sm", margin = "md" }: Props) {
  function getSize() {
    if (size === "sm") return "h-px";
    if (size === "md") return "h-1";
    return "h-1.5";
  }

  function getMargin() {
    if (margin === "sm") return "my-4";
    if (margin === "md") return "my-6";
    return "my-8";
  }

  const sizeClass = getSize();
  const marginClass = getMargin();
  return (
    <div
      className={twMerge(
        "bg-gray-200 dark:bg-slate-600 dark:text-slate-100",
        sizeClass,
        marginClass,
        className,
      )}
    />
  );
}
