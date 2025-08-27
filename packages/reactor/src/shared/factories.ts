import { type ShutdownStatus } from "./types.js";

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
  };
}

/**
 * Factory method to create a ShutdownStatus that can be updated
 *
 * @param initialState - Initial shutdown state (default: false)
 * @returns A tuple of [ShutdownStatus, setter function]
 */
export function createMutableShutdownStatus(
  initialState = false,
): [ShutdownStatus, (value: boolean) => void] {
  let shutdownState = initialState;

  const status: ShutdownStatus = {
    get isShutdown() {
      return shutdownState;
    },
  };

  const setShutdown = (value: boolean) => {
    shutdownState = value;
  };

  return [status, setShutdown];
}
