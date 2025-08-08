import { useEffect } from "react";

/**
 * Reusable debounce hook that calls a callback function after a specified delay
 * when the value changes. Useful for API calls, search inputs, etc.
 * 
 * @param value - The value to debounce
 * @param callback - Function to call with the debounced value (optional)
 * @param delay - Delay in milliseconds
 */
export function useDebounce<T>(value: T, callback: ((value: T) => void) | undefined, delay: number) {
  useEffect(() => {
    if (!callback) return;
    
    const timer = setTimeout(() => {
      callback(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, callback, delay]);
}