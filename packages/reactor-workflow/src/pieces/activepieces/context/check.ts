// Context handed to a piece's app.checkConnection: the resolved auth and
// nothing else; other members throw with their path, as elsewhere.
import { throwingStub, withTouchTracking } from "./stubs.js";

export interface CheckConnectionLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// Log arguments can hold auth and the worker's stdio is dropped anyway, so
// piece logging is discarded rather than forwarded to the host.
const discardingLogger: CheckConnectionLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface CheckConnectionContextOptions {
  auth?: unknown;
  onTouch?: (member: string) => void;
}

export interface BuiltApCheckConnectionContext {
  auth: unknown;
  propsValue: Record<string, unknown>;
  logger: CheckConnectionLogger;
  store: unknown;
  files: unknown;
  server: unknown;
  events: unknown;
  flow: unknown;
}

export interface CheckConnectionContextHandle {
  context: BuiltApCheckConnectionContext;
  // Top-level members the check read; `UNDOCUMENTED:<name>` marks unknown reads.
  touched: ReadonlySet<string>;
}

export function buildCheckConnectionContext(
  options: CheckConnectionContextOptions = {},
): CheckConnectionContextHandle {
  const touched = new Set<string>();
  const base: Record<string, unknown> = {
    auth: options.auth,
    propsValue: {},
    logger: discardingLogger,
    store: throwingStub("store"),
    files: throwingStub("files"),
    server: throwingStub("server"),
    events: throwingStub("events"),
    flow: throwingStub("flow"),
  };
  const context = withTouchTracking(base, touched, options.onTouch);
  return {
    context: context as unknown as BuiltApCheckConnectionContext,
    touched,
  };
}
