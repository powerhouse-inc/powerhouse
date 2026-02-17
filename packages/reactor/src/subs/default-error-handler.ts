import type {
  ISubscriptionErrorHandler,
  SubscriptionErrorContext,
} from "./types.js";

/**
 * Default error handler that re-throws subscription errors.
 * This ensures that errors are not silently swallowed.
 */
export class DefaultSubscriptionErrorHandler implements ISubscriptionErrorHandler {
  handleError(error: unknown, context: SubscriptionErrorContext): void {
    const errorMessage = `Subscription error in ${context.eventType} (${context.subscriptionId})`;

    if (error instanceof Error) {
      // Preserve the original error with additional context
      const enhancedError = new Error(`${errorMessage}: ${error.message}`);
      enhancedError.cause = error;
      enhancedError.stack = error.stack;
      throw enhancedError;
    } else {
      // Handle non-Error objects
      throw new Error(`${errorMessage}: ${String(error)}`);
    }
  }
}

/**
 * Creates a default subscription error handler instance
 */
export function createDefaultSubscriptionErrorHandler(): ISubscriptionErrorHandler {
  return new DefaultSubscriptionErrorHandler();
}
