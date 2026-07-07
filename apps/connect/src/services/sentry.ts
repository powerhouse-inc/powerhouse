// Lazy Sentry accessors: the SDK (and rrweb replay) stays off the boot path
// until useInitSentry dynamically loads it. No-ops while Sentry is disabled.
import type * as SentryModule from "@sentry/react";

let sentry: typeof SentryModule | undefined;

export function setSentryModule(mod: typeof SentryModule | undefined): void {
  sentry = mod;
}

export function captureException(
  ...args: Parameters<typeof SentryModule.captureException>
): void {
  sentry?.captureException(...args);
}

export function setUser(
  ...args: Parameters<typeof SentryModule.setUser>
): void {
  sentry?.setUser(...args);
}
