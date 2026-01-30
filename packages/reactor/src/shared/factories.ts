import type { ShutdownStatus } from "./types.js";

/**
 * Factory method to create a ShutdownStatus object
 *
 * @param isShutdown - Initial shutdown state
 * @returns A ShutdownStatus object with a getter for the shutdown state
 */
export function createShutdownStatus(isShutdown: boolean): ShutdownStatus {
  const shutdownState = isShutdown;

  return {
    get isShutdown() {
      return shutdownState;
    },
    completed: Promise.resolve(),
  };
}

/**
 * Factory method to create a ShutdownStatus that can be updated
 *
 * @param initialState - Initial shutdown state (default: false)
 * @returns A tuple of [ShutdownStatus, setShutdown function, setCompleted function]
 */
export function createMutableShutdownStatus(
  initialState = false,
): [
  ShutdownStatus,
  (value: boolean) => void,
  (completed: Promise<void>) => void,
] {
  let shutdownState = initialState;
  let completedPromise: Promise<void> = Promise.resolve();

  const status: ShutdownStatus = {
    get isShutdown() {
      return shutdownState;
    },
    get completed() {
      return completedPromise;
    },
  };

  const setShutdown = (value: boolean) => {
    shutdownState = value;
  };

  const setCompleted = (promise: Promise<void>) => {
    completedPromise = promise;
  };

  return [status, setShutdown, setCompleted];
}
