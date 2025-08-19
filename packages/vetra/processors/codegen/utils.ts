import { logger } from "./logger.js";

/**
 * Simple debounce utility function that handles async functions
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay = 100,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>): void => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      try {
        await func(...args);
      } catch (error) {
        logger.error(`Error in debounced function:`, error);
      }
    }, delay);
  };
}
