import { cn } from "../utils";

type Props = {
  className?: string;
};
export function Divider({ className }: Props) {
  return <div className={cn("my-2 h-1 bg-gray-900", className)} />;
}
