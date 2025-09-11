import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type BaseProps<T extends HTMLElement = HTMLDivElement> = {
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  children?: React.ReactNode;
  containerProps?: Omit<React.HTMLAttributes<T>, "className" | "style" | "id">;
};
