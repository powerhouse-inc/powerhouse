import { cn } from "../utils/style.js";

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
    <div className={cn("bg-gray-200", sizeClass, marginClass, className)} />
  );
}
