import type { ISubscriptionErrorHandler } from "./types.js";
import { DefaultSubscriptionErrorHandler } from "./default-error-handler.js";

export function createDefaultSubscriptionErrorHandler(): ISubscriptionErrorHandler {
  return new DefaultSubscriptionErrorHandler();
}
