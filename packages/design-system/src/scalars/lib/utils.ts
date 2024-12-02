import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Utility function to create and dispatch a native "change" event
export const dispatchNativeChangeEvent = (
  value: string | number,
  event: string,
) => {
  const nativeEvent = new Event(event, {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(nativeEvent, "target", {
    value: { value: value },
    writable: false,
  });

  return nativeEvent;
};
