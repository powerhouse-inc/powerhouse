import { cn } from "../utils";

type Props = {
  className?: string;
  size?: "sm" | "md" | "lg";
  margin?: "sm" | "md" | "lg";
};
export function Divider({ className, size = "md", margin = "md" }: Props) {
  function getSize() {
    if (size === "sm") return "h-0.5";
    if (size === "md") return "h-1";
    return "h-1.5";
  }

  function getMargin() {
    if (margin === "sm") return "my-2";
    if (margin === "md") return "my-3";
    return "my-4";
  }

  const sizeClass = getSize();
  const marginClass = getMargin();
  return (
    <div className={cn("bg-gray-900", sizeClass, marginClass, className)} />
  );
}
